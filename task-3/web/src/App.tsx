import { useEffect, useState } from "react";
import "./App.css";
import { api, getDemoUserId, setDemoUserId, type DemoUser } from "./api/client";
import { HcpView } from "./views/HcpView";
import { StewardView } from "./views/StewardView";

export default function App() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listUsers()
      .then(async (list) => {
        setUsers(list);
        const storedId = getDemoUserId();
        const initial = list.find((u) => u.id === storedId) ?? list[0];
        if (initial) {
          setDemoUserId(initial.id);
          const resolved = await api.me();
          setCurrentUser(resolved);
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function switchUser(id: string) {
    setDemoUserId(id);
    setError(null);
    try {
      const resolved = await api.me();
      setCurrentUser(resolved);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">HCP Address Intelligence</div>
        <div className="user-switcher">
          <label htmlFor="user-select">Viewing as</label>
          <select
            id="user-select"
            value={currentUser?.id ?? ""}
            onChange={(e) => switchUser(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role === "hcp" ? "HCP" : "Data Steward"})
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="app-main">
        {loading && <p>Loading...</p>}
        {error && <p className="error-banner">{error}</p>}
        {!loading && currentUser?.role === "hcp" && <HcpView user={currentUser} />}
        {!loading && currentUser?.role === "data_steward" && <StewardView />}
      </main>
    </div>
  );
}
