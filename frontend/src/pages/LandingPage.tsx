import { ArrowRight, BarChart3, BrainCircuit, Database, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link className="brand" to="/">
          <span className="brand__mark">
            <BrainCircuit size={19} />
          </span>
          <span>
            <strong>VoltPulse</strong>
            <small>NILM Platform</small>
          </span>
        </Link>
        <Link className="button button--secondary" to="/dashboard">
          Open dashboard
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__content">
          <span className="eyebrow">Cloud-native Non-Intrusive Load Monitoring</span>
          <h1>VoltPulse NILM Platform</h1>
          <p>
            Dataset-backed appliance disaggregation, smart meter telemetry, anomaly operations,
            and reproducible model evaluation in one research-ready control room.
          </p>
          <div className="landing-actions">
            <Link className="button" to="/dashboard/nilm-lab">
              Explore NILM Lab <ArrowRight size={16} />
            </Link>
            <Link className="button button--secondary" to="/dashboard">
              Sign in
            </Link>
          </div>
        </div>
        <div className="landing-signal" aria-hidden="true">
          <div className="signal-line signal-line--one" />
          <div className="signal-line signal-line--two" />
          <div className="signal-line signal-line--three" />
          <div className="signal-card">
            <span>UK-DALE sample</span>
            <strong>Aggregate → Appliance</strong>
          </div>
        </div>
      </section>

      <section className="landing-modules">
        <article>
          <Database size={20} />
          <h2>Dataset layer</h2>
          <p>Unified schema for aggregate power and appliance-level ground truth.</p>
        </article>
        <article>
          <BarChart3 size={20} />
          <h2>ML layer</h2>
          <p>Baseline disaggregation now, experiment tracking and Seq2Point next.</p>
        </article>
        <article>
          <ShieldCheck size={20} />
          <h2>Platform layer</h2>
          <p>Dashboard, anomaly review, simulator, and typed API access.</p>
        </article>
      </section>
    </main>
  );
}
