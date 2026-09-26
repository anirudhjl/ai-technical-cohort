import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface RawAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CaseRecord {
  caseId: string;
  status: string;
  request: { sourceSystem: string; receivedAt: string; rawPayload: Record<string, unknown> };
  identity: { candidateHcpId?: string; confidence: number; evidence: string[] };
  address: { raw: RawAddress; standardized?: RawAddress; validationFlags: string[] };
  reconciliation: { status: string; details: string[] };
  qualityScore: { value: number; band: string; ruleTrace: string[] };
  guardrailChecks: Array<{ rule: string; passed: boolean; note?: string }>;
  humanApproval?: { status: string; approver: string; reason: string; timestamp: string };
  finalAction?: { type: string; appliedAt: string; masterRecordVersion?: string };
  auditTrail: Array<{ timestamp: string; agent: string; skill?: string; tool?: string; evidence?: string; decision: string }>;
}

function formatAddress(address?: RawAddress): string {
  if (!address) return "(not standardized)";
  const line2 = address.line2 ? `, ${address.line2}` : "";
  return `${address.line1}${line2}, ${address.city}, ${address.state} ${address.postalCode}`;
}

export function CaseDetail({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editedAddress, setEditedAddress] = useState<RawAddress | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tracks the caseId this component is *currently* showing, independent of
  // which render's closure a given load() call was made from — a plain
  // closure over the caseId prop can't tell a superseded request apart from
  // the current one, since the stale call's own closure never sees the update.
  const currentCaseId = useRef(caseId);
  currentCaseId.current = caseId;

  function load() {
    const requestedCaseId = caseId;
    api
      .getCase(caseId)
      .then((r) => {
        if (currentCaseId.current !== requestedCaseId) return;
        setRecord(r as unknown as CaseRecord);
      })
      .catch((err) => {
        if (currentCaseId.current !== requestedCaseId) return;
        setError((err as Error).message);
      });
  }

  useEffect(load, [caseId]);

  async function approve() {
    if (!reason.trim()) {
      setError("A reason is required to approve.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.approveCase(caseId, reason, editedAddress ? { ...editedAddress } : undefined);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setError("A reason is required to reject.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.rejectCase(caseId, reason);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit() {
    if (record?.address.standardized) {
      setEditedAddress({ ...record.address.standardized });
      setEditing(true);
    }
  }

  if (error && !record) return <p className="error-banner">{error}</p>;
  if (!record) return <p>Loading case...</p>;

  // Every case halts at awaiting_approval regardless of band (CLAUDE.md
  // Business Rule 6) — the decision panel only ever applies there, not to
  // completed/rejected/blocked cases being viewed after the fact.
  const canDecide = record.status === "awaiting_approval";

  return (
    <section className="case-detail">
      <button className="back-link" onClick={onBack}>
        &larr; Back to queue
      </button>
      <h1>{record.caseId}</h1>
      <p className="status-line">
        Status: <strong>{record.status}</strong> · Band: <strong>{record.qualityScore.band}</strong> (score{" "}
        {record.qualityScore.value.toFixed(2)})
      </p>

      {error && <p className="error-banner">{error}</p>}

      <div className="grid">
        <div className="card">
          <h2>Source</h2>
          <p>System: {record.request.sourceSystem}</p>
          <p>Received: {new Date(record.request.receivedAt).toLocaleString()}</p>
        </div>

        <div className="card">
          <h2>Identity</h2>
          <p>Candidate: {record.identity.candidateHcpId ?? "none found"}</p>
          <p>Confidence: {record.identity.confidence.toFixed(2)}</p>
          <ul>
            {record.identity.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Address</h2>
          <p>Raw: {formatAddress(record.address.raw)}</p>
          <p>Standardized: {formatAddress(record.address.standardized)}</p>
          {record.address.validationFlags.length > 0 && (
            <p className="flags">Flags: {record.address.validationFlags.join(", ")}</p>
          )}
        </div>

        <div className="card">
          <h2>Reconciliation</h2>
          <p>Status: {record.reconciliation.status}</p>
          <ul>
            {record.reconciliation.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Guardrail checks</h2>
          <ul className="guardrail-list">
            {record.guardrailChecks.map((g, i) => (
              <li key={i} className={g.passed ? "pass" : "fail"}>
                <strong>{g.passed ? "PASS" : "FAIL"}</strong> {g.rule}
                {g.note && <div className="meta">{g.note}</div>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Audit trail</h2>
          <ol className="audit-timeline">
            {record.auditTrail.map((entry, i) => (
              <li key={i}>
                <div className="meta">{new Date(entry.timestamp).toLocaleString()}</div>
                <div>
                  <strong>{entry.agent}</strong>
                  {entry.skill ? ` / ${entry.skill}` : ""}
                  {entry.tool ? ` / ${entry.tool}` : ""}
                </div>
                {entry.evidence && <div className="evidence">Evidence: {entry.evidence}</div>}
                <div className="decision">Decision: {entry.decision}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {canDecide && (
        <div className="card decision-panel">
          <h2>Data Steward decision</h2>
          {!editing && record.address.standardized && (
            <button onClick={startEdit}>Edit address before deciding</button>
          )}
          {editing && editedAddress && (
            <div className="edit-address">
              {(["line1", "line2", "city", "state", "postalCode"] as const).map((field) => (
                <label key={field}>
                  {field}
                  <input
                    value={editedAddress[field] ?? ""}
                    onChange={(e) => setEditedAddress({ ...editedAddress, [field]: e.target.value })}
                  />
                </label>
              ))}
              <button onClick={() => setEditing(false)}>Done editing</button>
            </div>
          )}
          <textarea
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="decision-actions">
            <button className="approve" disabled={submitting} onClick={approve}>
              Approve &amp; Apply
            </button>
            <button className="reject" disabled={submitting} onClick={reject}>
              Reject
            </button>
          </div>
        </div>
      )}

      {record.humanApproval && (
        <div className="card">
          <h2>Human approval</h2>
          <p>
            {record.humanApproval.approver} — {record.humanApproval.status} — {record.humanApproval.reason}
          </p>
        </div>
      )}

      {record.finalAction && (
        <div className="card">
          <h2>Final action</h2>
          <p>
            {record.finalAction.type} applied at {new Date(record.finalAction.appliedAt).toLocaleString()}
            {record.finalAction.masterRecordVersion ? ` (version ${record.finalAction.masterRecordVersion})` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
