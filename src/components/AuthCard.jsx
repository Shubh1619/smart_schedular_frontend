import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AuthCard() {
  const { saveAuth } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", otp: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload = { email: form.email, password: form.password, full_name: form.full_name };
      const { data } = await api.post("/register", payload);
      setMessage(data.message);
      setMode("otp");
    } catch (error) {
      setMessage(error.response?.data?.detail ?? "Unable to register");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.post("/verify-otp", { email: form.email, otp: form.otp });
      setMessage(data.message);
      setMode("login");
    } catch (error) {
      setMessage(error.response?.data?.detail ?? "Unable to verify OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.post("/login", { email: form.email, password: form.password });
      saveAuth(data);
    } catch (error) {
      setMessage(error.response?.data?.detail ?? "Invalid login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-card bg-white p-8 shadow-card">
      <h1 className="text-2xl font-bold text-brand-text">Smart Schedular</h1>
      <p className="mt-1 text-sm text-brand-muted">Collaborative scheduling for your team.</p>

      {mode === "register" && (
        <form onSubmit={handleRegister} className="mt-5 space-y-3">
          <input className="w-full rounded-xl border p-3" placeholder="Name" value={form.full_name} onChange={(e) => updateField("full_name", e.target.value)} />
          <input type="email" className="w-full rounded-xl border p-3" placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className="w-full rounded-xl border p-3 pr-10" placeholder="Password" value={form.password} onChange={(e) => updateField("password", e.target.value)} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-500 hover:text-gray-700">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button disabled={loading} className="w-full rounded-xl bg-brand-primary p-3 font-semibold text-white">
            {loading ? "Creating..." : "Register & Send OTP"}
          </button>
          <p className="text-center text-sm text-brand-muted">
            Already have an account?{" "}
            <button
              type="button"
              className="font-semibold text-brand-primary underline underline-offset-4"
              onClick={() => setMode("login")}
            >
              Login
            </button>
          </p>
        </form>
      )}

      {mode === "otp" && (
        <form onSubmit={handleVerify} className="mt-5 space-y-3">
          <input type="email" className="w-full rounded-xl border p-3" placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          <input className="w-full rounded-xl border p-3" placeholder="OTP" value={form.otp} onChange={(e) => updateField("otp", e.target.value)} />
          <button disabled={loading} className="w-full rounded-xl bg-brand-primary p-3 font-semibold text-white">
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
          <p className="text-center text-sm text-brand-muted">
            Back to{" "}
            <button
              type="button"
              className="font-semibold text-brand-primary underline underline-offset-4"
              onClick={() => setMode("login")}
            >
              Login
            </button>
          </p>
        </form>
      )}

      {mode === "login" && (
        <form onSubmit={handleLogin} className="mt-5 space-y-3">
          <input type="email" className="w-full rounded-xl border p-3" placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className="w-full rounded-xl border p-3 pr-10" placeholder="Password" value={form.password} onChange={(e) => updateField("password", e.target.value)} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-500 hover:text-gray-700">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button disabled={loading} className="w-full rounded-xl bg-brand-primary p-3 font-semibold text-white">
            {loading ? "Signing in..." : "Login"}
          </button>
          <p className="text-center text-sm text-brand-muted">
            Don't have an account?{" "}
            <button
              type="button"
              className="font-semibold text-brand-primary underline underline-offset-4"
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </p>
        </form>
      )}

      {message && <p className="mt-4 text-sm text-brand-muted">{message}</p>}
    </div>
  );
}
