import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const PROFILE_THEME_KEY = "smart_schedular_theme";

function getLocalToday() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function getApiErrorMessage(err, fallbackMessage) {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallbackMessage;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const path = Array.isArray(entry.loc) ? entry.loc.join(".") : "";
          const msg = typeof entry.msg === "string" ? entry.msg : "";
          if (path && msg) return `${path}: ${msg}`;
          if (msg) return msg;
        }
        return "";
      })
      .filter(Boolean);
    if (messages.length) return messages.join("\n");
  }
  if (typeof detail === "object") {
    if (typeof detail.message === "string") return detail.message;
    return JSON.stringify(detail);
  }
  return fallbackMessage;
}

const emptyItemForm = {
  type: "event",
  title: "",
  description: "",
  date: "",
  time: "",
  assignee_ids: [],
  attachments: []
};

export default function Dashboard() {
  const { auth, saveAuth, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem(PROFILE_THEME_KEY) || "light");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("profile");

  const [teams, setTeams] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [teamMembersMap, setTeamMembersMap] = useState({});
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getLocalToday());

  const [profileForm, setProfileForm] = useState({ full_name: "", email: "" });
  const [profileLoading, setProfileLoading] = useState(false);

  const [teamForm, setTeamForm] = useState({ name: "", participant_emails: "" });
  const [teamFormLoading, setTeamFormLoading] = useState(false);
  const [inviteEmailByTeam, setInviteEmailByTeam] = useState({});
  const [renameByTeam, setRenameByTeam] = useState({});

  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemSaving, setItemSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [selectedCalendarItem, setSelectedCalendarItem] = useState(null);
  const [assigneePicker, setAssigneePicker] = useState("");
  const [linkInput, setLinkInput] = useState("");

  const joinTokenHandledRef = useRef(false);
  const isDark = theme === "dark";

  useEffect(() => {
    localStorage.setItem(PROFILE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!joinTokenHandledRef.current) {
      handleJoinToken();
    }
  }, [auth?.access_token]);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamMembers(selectedTeamId);
      setItemForm((prev) => ({ ...prev, team_id: selectedTeamId, date: prev.date || selectedDate }));
    }
  }, [selectedTeamId]);

  useEffect(() => {
    setItemForm((prev) => ({ ...prev, date: prev.date || selectedDate }));
  }, [selectedDate]);

  async function handleJoinToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    joinTokenHandledRef.current = true;
    try {
      await api.get("/join-team", { params: { token } });
      await loadTeamsAndSchedule();
      params.delete("token");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch (err) {
      console.error("Unable to join team via invite link:", err);
    }
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");
      await Promise.all([loadProfile(), loadTeamsAndSchedule()]);
    } catch (err) {
      setError(err.response?.data?.detail ?? "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile() {
    const { data } = await api.get("/profile");
    setProfileForm((prev) => ({
      ...prev,
      full_name: data.full_name || "",
      email: data.email || ""
    }));
  }

  async function loadTeamsAndSchedule() {
    const [teamsResponse, scheduleResponse] = await Promise.all([api.get("/teams"), api.get("/schedule")]);
    const teamList = teamsResponse.data || [];
    setTeams(teamList);
    setScheduleItems(scheduleResponse.data || []);

    if (!selectedTeamId || !teamList.find((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teamList[0]?.id ?? null);
    }
  }

  async function loadTeamMembers(teamId) {
    if (!teamId) return;
    try {
      const { data } = await api.get(`/teams/${teamId}/members`);
      setTeamMembersMap((prev) => ({ ...prev, [teamId]: data || [] }));
    } catch (err) {
      console.error("Unable to load members:", err);
    }
  }

  const teamMembers = teamMembersMap[selectedTeamId] || [];

  const calendarEvents = useMemo(
    () =>
      scheduleItems
        .filter((item) => !selectedTeamId || item.team_id === selectedTeamId)
        .map((item) => ({
          id: String(item.id),
          title: `[${item.type.toUpperCase()}] ${item.title}`,
          start: item.time ? `${item.date}T${item.time}` : item.date,
          allDay: !item.time
        })),
    [scheduleItems, selectedTeamId]
  );

  const itemsForSelectedDate = useMemo(
    () =>
      scheduleItems
        .filter((item) => (!selectedTeamId || item.team_id === selectedTeamId) && item.date === selectedDate)
        .sort((a, b) => (a.time || "").localeCompare(b.time || "")),
    [scheduleItems, selectedDate, selectedTeamId]
  );

  const selectedCalendarItemAssignees = useMemo(() => {
    if (!selectedCalendarItem) return [];
    const itemAssigneeIds = (selectedCalendarItem.assignments || []).map((assignment) => assignment.user_id);
    const members = teamMembersMap[selectedCalendarItem.team_id] || [];
    return members.filter((member) => itemAssigneeIds.includes(member.user_id));
  }, [selectedCalendarItem, teamMembersMap]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const isSelectedTeamOwner = selectedTeam?.owner_id === auth?.user_id;

  async function handleProfileSave(e) {
    e.preventDefault();
    try {
      setProfileLoading(true);
      const payload = {
        full_name: profileForm.full_name,
        email: profileForm.email
      };
      const { data } = await api.put("/profile", payload);
      saveAuth(data);
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to update profile"));
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleTeamCreate(e) {
    e.preventDefault();
    if (!teamForm.name.trim()) return;
    try {
      setTeamFormLoading(true);
      const participant_emails = teamForm.participant_emails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      const { data } = await api.post("/create-team", {
        name: teamForm.name.trim(),
        participant_emails
      });
      setTeams((prev) => [data, ...prev]);
      setSelectedTeamId(data.id);
      setTeamForm({ name: "", participant_emails: "" });
      setSidebarTab("profile");
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to create team"));
    } finally {
      setTeamFormLoading(false);
    }
  }

  async function handleTeamRename(teamId) {
    const name = (renameByTeam[teamId] || "").trim();
    if (!name) return;
    try {
      const { data } = await api.put(`/teams/${teamId}`, { name });
      setTeams((prev) => prev.map((team) => (team.id === teamId ? data : team)));
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to update team"));
    }
  }

  async function handleTeamDelete(teamId) {
    const ok = window.confirm("Delete this team?");
    if (!ok) return;
    try {
      await api.delete(`/teams/${teamId}`);
      await loadTeamsAndSchedule();
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to delete team"));
    }
  }

  async function handleMemberInvite(teamId) {
    const emailString = (inviteEmailByTeam[teamId] || "").trim();
    if (!emailString) return;
    const emails = emailString.split(",").map(email => email.trim()).filter(email => email);
    if (emails.length === 0) return;
    try {
      await api.post("/invite-member", { team_id: teamId, emails });
      setInviteEmailByTeam((prev) => ({ ...prev, [teamId]: "" }));
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to send invite"));
    }
  }

  async function handleRemoveMember(teamId, memberUserId) {
    try {
      await api.delete(`/teams/${teamId}/members/${memberUserId}`);
      await loadTeamMembers(teamId);
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to remove member"));
    }
  }

  function resetItemForm(type = "event") {
    setEditingItemId(null);
    setLinkInput("");
    setItemForm({
      ...emptyItemForm,
      type,
      date: selectedDate,
      team_id: selectedTeamId
    });
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setLinkInput("");
    setItemForm({
      team_id: item.team_id,
      type: item.type,
      title: item.title,
      description: item.description || "",
      date: item.date,
      time: item.time || "",
      assignee_ids: (item.assignments || []).map((assignment) => assignment.user_id),
      attachments: (item.attachments || []).map((attachment) => ({
        url: attachment.url,
        label: attachment.label || ""
      }))
    });
  }

  async function handleItemSave(e) {
    e.preventDefault();
    if (!itemForm.title.trim() || !itemForm.team_id || !itemForm.date) return;
    const today = getLocalToday();
    if (itemForm.date < today) {
      window.alert("Past dates are not allowed for events, tasks, or notes");
      return;
    }

    const payload = {
      team_id: itemForm.team_id,
      type: itemForm.type,
      title: itemForm.title.trim(),
      description: itemForm.description.trim() || null,
      date: itemForm.date,
      time: itemForm.time || null,
      assignee_ids: itemForm.assignee_ids,
      attachments: itemForm.attachments
    };

    try {
      setItemSaving(true);
      if (editingItemId) {
        await api.put(`/update-item/${editingItemId}`, payload);
      } else {
        await api.post("/create-item", payload);
      }
      await loadTeamsAndSchedule();
      resetItemForm(itemForm.type);
      setLinkInput("");
    } catch (err) {
      window.alert(getApiErrorMessage(err, "Unable to save item"));
    } finally {
      setItemSaving(false);
    }
  }

  function handleAssigneeSelectChange(e) {
    setAssigneePicker(e.target.value);
  }

  function addSelectedAssignee() {
    if (!assigneePicker) return;
    const nextAssigneeId = Number(assigneePicker);
    setItemForm((prev) => {
      if (prev.assignee_ids.includes(nextAssigneeId)) return prev;
      return { ...prev, assignee_ids: [...prev.assignee_ids, nextAssigneeId] };
    });
    setAssigneePicker("");
  }

  function clearAssignees() {
    setItemForm((prev) => ({ ...prev, assignee_ids: [] }));
  }

  function addLinkAttachment() {
    const url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      window.alert("Please enter a valid link starting with http:// or https://");
      return;
    }
    setItemForm((prev) => {
      if (prev.attachments.some((attachment) => attachment.url === url)) return prev;
      return {
        ...prev,
        attachments: [...prev.attachments, { url, label: "" }]
      };
    });
    setLinkInput("");
  }

  function removeLinkAttachment(url) {
    setItemForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((attachment) => attachment.url !== url)
    }));
  }

  function openSelectedTeamEditor() {
    if (!selectedTeam) return;
    setRenameByTeam((prev) => ({ ...prev, [selectedTeam.id]: prev[selectedTeam.id] ?? selectedTeam.name }));
    setSidebarTab("team");
    setSidebarOpen(true);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  const surface = isDark ? "bg-slate-900 text-slate-100" : "bg-slate-100 text-slate-900";
  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const control = isDark ? "border-slate-600 bg-slate-700 text-slate-100" : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`h-screen overflow-hidden ${surface}`}>
      <header className={`fixed inset-x-0 top-0 z-30 border-b ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 lg:px-6">
          <div>
            <h1 className="text-xl font-bold">Smart Schedular</h1>
            <p className={`text-sm ${subtle}`}>{auth?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSidebarTab("team");
                setSidebarOpen(true);
              }}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create Team
            </button>
            <button
              onClick={() => {
                setSidebarTab("profile");
                setSidebarOpen(true);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${isDark ? "border-slate-600 hover:bg-slate-700" : "border-slate-200 hover:bg-slate-50"}`}
            >
              Profile
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100dvh-80px)] w-full max-w-7xl grid-cols-1 gap-1 px-1 pb-1 pt-0 lg:grid-cols-12 lg:gap-2 lg:px-2 lg:pb-2">
        <section className={`col-span-1 lg:col-span-8 rounded-2xl border p-1 lg:p-2 ${card} flex min-h-0 flex-col`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">Team</label>
              <select
                value={selectedTeamId || ""}
                onChange={(e) => setSelectedTeamId(Number(e.target.value) || null)}
                className={`rounded-lg border px-3 py-2 text-sm ${control}`}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {isSelectedTeamOwner ? (
                <button
                  type="button"
                  onClick={openSelectedTeamEditor}
                  className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700"
                >
                  Edit Team
                </button>
              ) : null}
            </div>
            <div className={`text-sm ${subtle}`}>{selectedDate}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-indigo-200 bg-white p-1">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
              height="100%"
              events={calendarEvents}
              dateClick={(info) => setSelectedDate(info.dateStr)}
              eventClick={(info) => {
                const itemId = Number(info.event.id);
                const item = scheduleItems.find((entry) => entry.id === itemId);
                setSelectedDate(info.event.startStr.slice(0, 10));
                if (item) {
                  setSelectedCalendarItem(item);
                  if (!teamMembersMap[item.team_id]) {
                    loadTeamMembers(item.team_id);
                  }
                }
              }}
            />
          </div>

        </section>

        <section className={`col-span-1 lg:col-span-4 rounded-2xl border p-3 lg:p-4 ${card} flex min-h-0 flex-col`}>
          <h2 className="text-lg font-semibold">Items on {selectedDate}</h2>
          <p className={`mb-3 text-sm ${subtle}`}>Event, Task and Note </p>

          <form onSubmit={handleItemSave} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={itemForm.type}
                onChange={(e) => setItemForm((prev) => ({ ...prev, type: e.target.value }))}
                className={`rounded-lg border px-3 py-2 text-sm ${control}`}
              >
                <option value="event">Event</option>
                <option value="task">Task</option>
                <option value="note">Note</option>
              </select>
              <input
                type="date"
                value={itemForm.date}
                onChange={(e) => setItemForm((prev) => ({ ...prev, date: e.target.value }))}
                min={getLocalToday()}
                className={`rounded-lg border px-3 py-2 text-sm ${control}`}
                required
              />
            </div>
            <input
              value={itemForm.title}
              onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Title"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${control}`}
              required
            />
            <input
              type="time"
              value={itemForm.time}
              onChange={(e) => setItemForm((prev) => ({ ...prev, time: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${control}`}
            />
            <textarea
              value={itemForm.description}
              onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className={`h-16 w-full rounded-lg border px-3 py-2 text-sm ${control}`}
            />

            <div className={`rounded-lg border p-2 ${isDark ? "border-slate-600" : "border-slate-200"}`}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Attach Links</p>
              <div className="flex gap-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://example.com"
                  className={`w-full rounded-lg border px-2 py-2 text-sm ${control}`}
                />
                <button type="button" onClick={addLinkAttachment} className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700">
                  Add
                </button>
              </div>
              {itemForm.attachments.length ? (
                <div className="mt-2 space-y-1">
                  {itemForm.attachments.map((attachment) => (
                    <div key={attachment.url} className="flex items-center justify-between gap-2 text-xs">
                      <a href={attachment.url} target="_blank" rel="noreferrer" className="truncate text-indigo-600 underline">
                        {attachment.url}
                      </a>
                      <button type="button" onClick={() => removeLinkAttachment(attachment.url)} className="font-semibold text-rose-600">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={`rounded-lg border p-2 ${isDark ? "border-slate-600" : "border-slate-200"}`}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Assign Team Members</p>
              <div className="flex gap-2">
                <select value={assigneePicker} onChange={handleAssigneeSelectChange} className={`w-full rounded-lg border px-2 py-2 text-sm ${control}`}>
                  <option value="">Select member</option>
                  {teamMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addSelectedAssignee} className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700">
                  Add
                </button>
              </div>
              <div className={`mt-2 flex items-center justify-between text-xs ${subtle}`}>
                <span>
                  {itemForm.assignee_ids.length
                    ? `Selected: ${teamMembers.filter((m) => itemForm.assignee_ids.includes(m.user_id)).map((m) => m.full_name).join(", ")}`
                    : "Selected: none"}
                </span>
                <button type="button" onClick={clearAssignees} className="font-semibold text-indigo-600">
                  Clear
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button disabled={itemSaving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                {itemSaving ? "Saving..." : editingItemId ? "Update" : "Create"}
              </button>
              {editingItemId ? (
                <button type="button" onClick={() => resetItemForm("event")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="visible-scroll mt-3 min-h-0 flex-1 overflow-auto space-y-2 pr-1">
            {itemsForSelectedDate.map((item) => (
              <div key={item.id} className={`rounded-lg border p-3 ${isDark ? "border-slate-600" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className={`text-xs uppercase ${subtle}`}>{item.type}</p>
                    <p className={`text-sm ${subtle}`}>{item.description || "No description"}</p>
                    <p className={`text-xs ${subtle}`}>{item.time || "All day"}</p>
                    {(item.attachments || []).length ? (
                      <div className="mt-1 space-y-1">
                        {item.attachments.map((attachment) => (
                          <a key={attachment.id || attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="block text-xs text-indigo-600 underline">
                            {attachment.label || attachment.url}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditItem(item)} className="text-xs font-semibold text-indigo-600">Edit</button>
                  </div>
                </div>
              </div>
            ))}
            {!itemsForSelectedDate.length ? <p className={`text-sm ${subtle}`}>No items for this date.</p> : null}
          </div>
        </section>
      </main>

      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-40 transition ${sidebarOpen ? "pointer-events-auto bg-black/30 opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[420px] transform border-l p-5 transition-transform ${sidebarOpen ? "translate-x-0" : "translate-x-full"} ${isDark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Profile Sidebar</h3>
          <button onClick={() => setSidebarOpen(false)} className={`text-sm ${subtle}`}>Close</button>
        </div>

        <div className="mb-4 flex gap-2">
          <button onClick={() => setSidebarTab("profile")} className={`rounded-lg px-3 py-1.5 text-sm ${sidebarTab === "profile" ? "bg-indigo-600 text-white" : isDark ? "bg-slate-700" : "bg-slate-100"}`}>
            Profile
          </button>
          <button onClick={() => setSidebarTab("team")} className={`rounded-lg px-3 py-1.5 text-sm ${sidebarTab === "team" ? "bg-indigo-600 text-white" : isDark ? "bg-slate-700" : "bg-slate-100"}`}>
            Create Team
          </button>
        </div>

        <button
          onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          className={`mb-4 w-full rounded-lg border px-4 py-2 text-sm font-semibold ${isDark ? "border-slate-600 hover:bg-slate-700" : "border-slate-300 hover:bg-slate-50"}`}
        >
          Switch to {isDark ? "Light" : "Dark"} Theme
        </button>

        {sidebarTab === "profile" ? (
          <form onSubmit={handleProfileSave} className="space-y-2">
            <input
              value={profileForm.full_name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="Full name"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${control}`}
            />
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${control}`}
            />
            <div className="flex gap-2">
              <button disabled={profileLoading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                {profileLoading ? "Saving..." : "Update Profile"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleTeamCreate} className="space-y-2">
            <input
              value={teamForm.name}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Team name"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${control}`}
              required
            />
            <textarea
              value={teamForm.participant_emails}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, participant_emails: e.target.value }))}
              placeholder="Participant emails (comma separated)"
              className={`min-h-24 w-full rounded-lg border px-3 py-2 text-sm ${control}`}
            />
            <button disabled={teamFormLoading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
              {teamFormLoading ? "Creating..." : "Create Team & Send Invites"}
            </button>
          </form>
        )}

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide">All Teams</h4>
          <div className="max-h-[42vh] space-y-3 overflow-hidden pr-1">
            {teams.map((team) => {
              const isOwner = team.owner_id === auth?.user_id;
              const members = teamMembersMap[team.id] || [];
              return (
                <div key={team.id} className={`rounded-xl border p-3 ${isDark ? "border-slate-600 bg-slate-700/40" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      {team.name} {isOwner ? <span className="text-xs text-emerald-500">(Owner)</span> : null}
                    </p>
                    <span className={`text-xs ${subtle}`}>{team.code}</span>
                  </div>

                  {isOwner ? (
                    <div className="mt-2 space-y-2">
                      <input
                        value={renameByTeam[team.id] ?? team.name}
                        onChange={(e) => setRenameByTeam((prev) => ({ ...prev, [team.id]: e.target.value }))}
                        className={`w-full rounded-lg border px-2 py-1 text-sm ${control}`}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleTeamRename(team.id)} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                          Update Team
                        </button>
                        <button onClick={() => handleTeamDelete(team.id)} className="rounded-lg border border-rose-400 px-3 py-1 text-xs font-semibold text-rose-600">
                          Delete Team
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={inviteEmailByTeam[team.id] || ""}
                          onChange={(e) => setInviteEmailByTeam((prev) => ({ ...prev, [team.id]: e.target.value }))}
                          placeholder="email1@example.com, email2@example.com"
                          className={`w-full rounded-lg border px-2 py-1 text-xs ${control}`}
                        />
                        <button onClick={() => handleMemberInvite(team.id)} className="rounded-lg border border-indigo-400 px-3 py-1 text-xs font-semibold text-indigo-600">
                          Invite
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-1">
                    <button onClick={() => loadTeamMembers(team.id)} className="text-xs font-semibold text-indigo-600">Load Members</button>
                    {members.map((member) => (
                      <div key={member.user_id} className="flex items-center justify-between text-xs">
                        <span>{member.full_name} ({member.role})</span>
                        {isOwner && member.user_id !== auth?.user_id ? (
                          <button onClick={() => handleRemoveMember(team.id, member.user_id)} className="text-rose-600">Remove</button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={logout} className="mt-4 w-full rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600">
          Logout
        </button>
      </aside>

      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">{error}</div>
      ) : null}

      {selectedCalendarItem ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-4" onClick={() => setSelectedCalendarItem(null)}>
          <div
            className={`w-full max-w-md rounded-xl border p-4 shadow-xl ${card}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold">{selectedCalendarItem.title}</p>
                <p className={`text-xs uppercase ${subtle}`}>{selectedCalendarItem.type}</p>
              </div>
              <button className={`text-sm ${subtle}`} onClick={() => setSelectedCalendarItem(null)}>
                Close
              </button>
            </div>

            <div className="space-y-1 text-sm">
              <p><span className="font-semibold">Date:</span> {selectedCalendarItem.date}</p>
              <p><span className="font-semibold">Time:</span> {selectedCalendarItem.time || "All day"}</p>
              <p><span className="font-semibold">Created by:</span> {selectedCalendarItem.creator_name}</p>
              <p><span className="font-semibold">Description:</span> {selectedCalendarItem.description || "No description"}</p>
              <p>
                <span className="font-semibold">Assigned to:</span>{" "}
                {selectedCalendarItemAssignees.length
                  ? selectedCalendarItemAssignees.map((member) => member.full_name).join(", ")
                  : "No assignees"}
              </p>
              {(selectedCalendarItem.attachments || []).length ? (
                <div>
                  <p><span className="font-semibold">Links:</span></p>
                  <div className="mt-1 space-y-1">
                    {selectedCalendarItem.attachments.map((attachment) => (
                      <a key={attachment.id || attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="block text-indigo-600 underline">
                        {attachment.label || attachment.url}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
