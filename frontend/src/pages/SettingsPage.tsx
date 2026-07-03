import { Server, ShieldCheck } from "lucide-react";

import { useAuth } from "../app/providers";
import { ComponentShowcase } from "../components/ui/ComponentShowcase";
import { StatusPill } from "../components/ui/StatusPill";
import { API_BASE_URL } from "../services/apiClient";

export function SettingsPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="page-stack">
      <section className="model-grid">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Session</span>
              <h2>Authentication state</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          <dl className="definition-list">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusPill tone={isAuthenticated ? "success" : "warning"}>
                  {isAuthenticated ? "Signed in" : "Guest"}
                </StatusPill>
              </dd>
            </div>
            <div>
              <dt>User</dt>
              <dd>{user?.email ?? "No authenticated user"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Runtime</span>
              <h2>API connection</h2>
            </div>
            <Server size={18} />
          </div>
          <dl className="definition-list">
            <div>
              <dt>Backend</dt>
              <dd>{API_BASE_URL}</dd>
            </div>
            <div>
              <dt>Frontend</dt>
              <dd>React + TypeScript + Vite</dd>
            </div>
          </dl>
        </article>
      </section>
      <ComponentShowcase />
    </div>
  );
}
