import { useEffect, useRef, useState } from "react";
import { api, type DemoUser } from "../api/client";

interface HcpAddressResponse {
  hcpId: string;
  name: string;
  specialty: string;
  currentAddress: Record<string, string>;
  addressHistory: Array<{
    address: Record<string, string>;
    sourceSystem: string;
    sourceTimestamp: string;
    recordedAt: string;
    version: number;
  }>;
  status: string;
}

function formatAddress(address: Record<string, string>): string {
  const line2 = address.line2 ? `, ${address.line2}` : "";
  return `${address.line1}${line2}, ${address.city}, ${address.state} ${address.postalCode}`;
}

export function HcpView({ user }: { user: DemoUser }) {
  const [data, setData] = useState<HcpAddressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // See CaseDetail's load() for why a ref (not the closed-over prop) is
  // needed to detect a superseded request — matters here if the user
  // switcher changes identity while a slower fetch for the old one is in flight.
  const currentHcpId = useRef(user.hcpId);
  currentHcpId.current = user.hcpId;

  useEffect(() => {
    if (!user.hcpId) return;
    const requestedHcpId = user.hcpId;
    api
      .hcpAddress(user.hcpId)
      .then((res) => {
        if (currentHcpId.current !== requestedHcpId) return;
        setData(res as HcpAddressResponse);
      })
      .catch((err) => {
        if (currentHcpId.current !== requestedHcpId) return;
        setError((err as Error).message);
      });
  }, [user.hcpId]);

  if (!user.hcpId) return <p>This account has no linked HCP record.</p>;
  if (error) return <p className="error-banner">{error}</p>;
  if (!data) return <p>Loading your record...</p>;

  return (
    <section className="hcp-view">
      <h1>{data.name}</h1>
      <p className="specialty">{data.specialty}</p>

      <div className="card status-card">
        <h2>Status</h2>
        <p>{data.status}</p>
      </div>

      <div className="card">
        <h2>Current address on file</h2>
        <p>{formatAddress(data.currentAddress)}</p>
      </div>

      <div className="card">
        <h2>History</h2>
        <ul className="history-list">
          {data.addressHistory
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.version}>
                <strong>v{entry.version}</strong> — {formatAddress(entry.address)}
                <div className="meta">
                  Source: {entry.sourceSystem}, recorded {new Date(entry.recordedAt).toLocaleDateString()}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
