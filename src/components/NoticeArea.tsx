import { useSessionStore } from "../stores/sessionStore";

/** Messages shown in the page instead of browser alerts: warnings, skipped records, errors. */
export function NoticeArea() {
  const notices = useSessionStore((s) => s.notices);
  const dismissNotice = useSessionStore((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <div className="notice-area" role="status">
      {notices.map((notice, index) => (
        <div className="notice" key={`${index}-${notice}`}>
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" title="Dismiss" onClick={() => dismissNotice(index)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
