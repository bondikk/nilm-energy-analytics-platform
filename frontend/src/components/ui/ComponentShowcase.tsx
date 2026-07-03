import { Activity, Database, Zap } from "lucide-react";

import { MetricCard } from "./MetricCard";
import { StatusPill } from "./StatusPill";

export function ComponentShowcase() {
  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Component system</span>
          <h2>Interface primitives</h2>
        </div>
        <StatusPill tone="success">Ready</StatusPill>
      </div>
      <div className="metric-grid metric-grid--compact">
        <MetricCard label="Signal" value="2.4 kW" detail="live aggregate" icon={<Zap size={18} />} />
        <MetricCard label="Dataset" value="UK-DALE" detail="unified sample" tone="green" icon={<Database size={18} />} />
        <MetricCard label="Model" value="Baseline" detail="threshold step" tone="amber" icon={<Activity size={18} />} />
      </div>
    </section>
  );
}
