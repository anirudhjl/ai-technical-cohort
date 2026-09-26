import { useEffect, useState } from "react";
import { api } from "../api/client";

interface LogEntry {
  timestamp: string;
  caseId: string;
  agent: string;
  skill?: string;
  tool?: string;
  durationMs: number;
  outcome: "ok" | "error" | "blocked";
  modelUsed?: string;
  note?: string;
}

interface Metrics {
  totalSteps: number;
  outcomeCounts: Record<string, number>;
  avgDurationMs: number;
}

export function Observability() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .observabilityLogs(150)
      .then((res) => {
        setLogs(res.logs as LogEntry[]);
        setMetrics(res.metrics as unknown as Metrics);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  if (error) return <p className="error-banner">{error}</p>;

  return (
    <section className="observability">
      {metrics && (
        <div className="card">
          <h2>Metrics</h2>
          <p>Total steps: {metrics.totalSteps}</p>
          <p>Avg duration: {metrics.avgDurationMs}ms</p>
          <p>
            Outcomes:{" "}
            {Object.entries(metrics.outcomeCounts)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
          </p>
        </div>
      )}

      <div className="card">
        <h2>Recent agent steps</h2>
        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Case</th>
                <th>Agent</th>
                <th>Skill/Tool</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i} className={`outcome-${l.outcome}`}>
                  <td>{new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td>{l.caseId.slice(0, 13)}...</td>
                  <td>{l.agent}</td>
                  <td>{[l.skill, l.tool].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{l.outcome}</td>
                  <td>{l.durationMs}ms</td>
                  <td>{l.modelUsed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
