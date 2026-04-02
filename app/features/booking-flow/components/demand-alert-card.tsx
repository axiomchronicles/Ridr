import { MaterialSymbol } from "~/features/shared/components/material-symbol";

type DemandAlertCardProps = {
  title: string;
  message: string;
};

export function DemandAlertCard({ title, message }: DemandAlertCardProps) {
  return (
    <aside className="demand-alert-card" aria-live="polite">
      <div className="demand-alert-icon-shell">
        <MaterialSymbol name="bolt" className="demand-alert-icon" filled />
      </div>
      <div className="demand-alert-copy">
        <p className="demand-alert-title">{title}</p>
        <p className="demand-alert-message">{message}</p>
      </div>
    </aside>
  );
}
