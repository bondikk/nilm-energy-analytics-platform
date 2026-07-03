import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "green" | "blue" | "amber" | "red";
  icon?: ReactNode;
}

export function MetricCard({ label, value, detail, tone = "blue", icon }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
