import { useState } from "react";
import { api } from "../api/client";

export default function TeamPanel({
  teams,
  activeTeamId,
  setActiveTeamId,
  onTeamsReload,
  members,
  onInviteJoined
}) {
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [status, setStatus] = useState("");

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  async function createTeam(e) {
    e.preventDefault();
    if (!createName.trim()) return;
    try {
      await api.post("/create-team", { name: createName });
      setCreateName("");
      setStatus("Team created");
      onTeamsReload();
    } catch (error) {
      setStatus(error.response?.data?.detail ?? "Unable to create team");
    }
  }

  async function joinTeam(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      await api.post("/join-team", { code: joinCode.trim().toUpperCase() });
      setJoinCode("");
      setStatus("Joined team");
      onTeamsReload();
      onInviteJoined?.();
    } catch (error) {
      setStatus(error.response?.data?.detail ?? "Unable to join team");
    }
  }

  async function inviteMember(e) {
    e.preventDefault();
    if (!activeTeam || !inviteEmail.trim()) return;
    try {
      const { data } = await api.post("/invite-member", { team_id: activeTeam.id, email: inviteEmail.trim() });
      setStatus(data.message);
      setInviteEmail("");
    } catch (error) {
      setStatus(error.response?.data?.detail ?? "Unable to invite");
    }
  }

  return (
    <aside className="space-y-4 rounded-card bg-white p-4 shadow-card lg:sticky lg:top-6">
      <h2 className="text-lg font-bold text-brand-text">Team Management</h2>
      <div>
        <label className="mb-2 block text-sm text-brand-muted">Active Team</label>
        <select
          className="w-full rounded-xl border bg-white p-2.5"
          value={activeTeamId || ""}
          onChange={(e) => setActiveTeamId(Number(e.target.value) || null)}
        >
          <option value="">Select team</option>
          {teams.map((team) => (
            <option value={team.id} key={team.id}>
              {team.name} ({team.code})
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={createTeam} className="space-y-2">
        <p className="text-sm font-semibold text-brand-text">Create Team</p>
        <input className="w-full rounded-xl border p-2.5" placeholder="Team name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
        <button className="w-full rounded-xl bg-brand-primary py-2 text-white">Create Team</button>
      </form>

      <form onSubmit={joinTeam} className="space-y-2">
        <p className="text-sm font-semibold text-brand-text">Join via Code</p>
        <input className="w-full rounded-xl border p-2.5 uppercase" placeholder="TEAMCODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <button className="w-full rounded-xl border border-brand-primary/35 bg-white py-2 text-brand-primary">Join Team</button>
      </form>

      <form onSubmit={inviteMember} className="space-y-2">
        <p className="text-sm font-semibold text-brand-text">Invite Member</p>
        <input className="w-full rounded-xl border p-2.5" placeholder="member@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        <button className="w-full rounded-xl border border-brand-primary/35 bg-white py-2 text-brand-primary">Send Invite</button>
      </form>

      {activeTeam && (
        <div className="rounded-xl bg-brand-surface p-3">
          <p className="text-sm font-semibold text-brand-text">Members</p>
          <ul className="mt-2 space-y-1 text-sm text-brand-muted">
            {members.map((m) => (
              <li key={m.user_id}>
                {m.full_name} ({m.role})
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && <p className="text-sm text-brand-muted">{status}</p>}
    </aside>
  );
}

