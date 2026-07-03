import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
