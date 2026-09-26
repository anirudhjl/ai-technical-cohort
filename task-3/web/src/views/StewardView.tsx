import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { CaseDetail } from "./CaseDetail";
import { Observability } from "./Observability";

interface CaseSummary {
  caseId: string;
  status: string;
  createdAt: string;
  request: { sourceSystem: string };
  identity: { candidateHcpId?: string; confidence: number };
  qualityScore: { band: string; value: number };
}

export function StewardView() {
  const [tab, setTab] = useState<"queue" | "observability">("queue");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [bandFilter, setBandFilter] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  const refresh = useCallback(() => {
    api
      .listCases({ status: statusFilter || undefined, band: bandFilter || undefined })
      .then((list) => setCases(list as unknown as CaseSummary[]))
      .catch((err) => setError((err as Error).message));
  }, [statusFilter, bandFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function ingestNext() {
    setIngesting(true);
    setError(null);
    try {
      const created = await api.ingestNextCase();
      // No refresh() here: we're about to switch straight to CaseDetail,
      // which unmounts this table immediately, so a queue refetch would be
      // fetched and thrown away. The queue is refreshed on onBack instead.
      setSelectedCaseId((created as { caseId: string }).caseId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIngesting(false);
    }
  }

  // Rendered in place of the queue (no router/URL for case detail) since
  // this is a single-operator local demo — a dedicated route would add
  // routing-library complexity with no real benefit here.
  if (selectedCaseId) {
    return (
      <CaseDetail
        caseId={selectedCaseId}
        onBack={() => {
          setSelectedCaseId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <section className="steward-view">
      <nav className="tabs">
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
          Case Queue
        </button>
        <button className={tab === "observability" ? "active" : ""} onClick={() => setTab("observability")}>
          Observability
        </button>
      </nav>

      {error && <p className="error-banner">{error}</p>}

      {tab === "queue" && (
        <>
          <div className="toolbar">
            <button onClick={ingestNext} disabled={ingesting}>
              {ingesting ? "Ingesting..." : "Ingest next record"}
            </button>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {["intake", "processing", "awaiting_approval", "approved", "rejected", "completed", "blocked"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
            <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
              <option value="">All bands</option>
              <option value="auto">auto</option>
              <option value="review">review</option>
              <option value="reject">reject</option>
            </select>
          </div>

          <div className="table-scroll">
            <table className="case-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Source</th>
                  <th>Candidate HCP</th>
                  <th>Confidence</th>
                  <th>Band</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.caseId}
                    onClick={() => setSelectedCaseId(c.caseId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedCaseId(c.caseId);
                    }}
                    className="clickable-row"
                    tabIndex={0}
                  >
                    <td>{c.caseId.slice(0, 13)}...</td>
                    <td>{c.request.sourceSystem}</td>
                    <td>{c.identity.candidateHcpId ?? "—"}</td>
                    <td>{c.identity.confidence.toFixed(2)}</td>
                    <td>
                      <span className={`band-pill band-${c.qualityScore.band}`}>{c.qualityScore.band}</span>
                    </td>
                    <td>{c.status}</td>
                    <td>{new Date(c.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {cases.length === 0 && (
                  <tr>
                    <td colSpan={7}>No cases yet — click "Ingest next record" to start the pipeline.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "observability" && <Observability />}
    </section>
  );
}
