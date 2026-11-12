import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  /** Which edge of the window the panel sits on; decides which way it folds. */
  side: "left" | "right";
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Controls shown in the header beside the title. */
  actions?: ReactNode;
  children: ReactNode;
};

/** A side panel card: header with title and collapse, body that scrolls on its own. */
export function Panel({ title, side, collapsed, onToggleCollapsed, actions, children }: PanelProps) {
  const Fold = side === "left" ? ChevronsLeft : ChevronsRight;
  const Unfold = side === "left" ? ChevronsRight : ChevronsLeft;

  if (collapsed) {
    return (
      <section className="panel panel-collapsed" aria-label={title}>
        <button
          type="button"
          className="panel-icon-btn"
          title={`Show ${title}`}
          aria-label={`Show ${title}`}
          aria-expanded={false}
          onClick={onToggleCollapsed}
        >
          <Unfold size={16} strokeWidth={1.75} />
        </button>
        <span className="panel-collapsed-title" aria-hidden="true">
          {title}
        </span>
      </section>
    );
  }

  return (
    <section className="panel" aria-label={title}>
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {actions}
        <button
          type="button"
          className="panel-icon-btn"
          title={`Hide ${title}`}
          aria-label={`Hide ${title}`}
          aria-expanded={true}
          onClick={onToggleCollapsed}
        >
          <Fold size={16} strokeWidth={1.75} />
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
