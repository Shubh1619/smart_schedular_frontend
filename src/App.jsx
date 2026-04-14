import { useAuth } from "./context/AuthContext";
import AuthCard from "./components/AuthCard";
import Dashboard from "./components/Dashboard";

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pt-20">
      {!isAuthenticated ? <AuthCard /> : <Dashboard />}
    </div>
  );
}
