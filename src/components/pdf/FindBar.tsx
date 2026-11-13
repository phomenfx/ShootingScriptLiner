/*
 * Find on script (Ctrl+F): a bar under the tools, and highlights on the pages.
 * Enter goes to the next match, Shift+Enter to the previous, Esc closes.
 */
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import * as commands from "../../commands";
import { useSessionStore } from "../../stores/sessionStore";

export function FindBar() {
  const find = useSessionStore((s) => s.find);
  if (!find.open) return null;
  const count = find.matches.length;
  const status = find.busy ? "Reading…" : !find.query.trim() ? "" : count === 0 ? "No matches" : `${find.index + 1} of ${count}`;
  return (
    <div className="find-bar" role="search">
      <Search size={14} strokeWidth={1.75} aria-hidden="true" />
      <input
        type="search"
        aria-label="Find on script"
        placeholder="Find on script"
        value={find.query}
        autoFocus
        onChange={(e) => void commands.setFindQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commands.findStep(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            commands.closeFind();
          }
        }}
      />
      <span className="find-count" aria-live="polite">
        {status}
      </span>
      <button type="button" className="script-iconbtn" title="Previous (Shift+Enter)" disabled={count === 0} onClick={() => commands.findStep(-1)}>
        <ChevronUp size={15} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Next (Enter)" disabled={count === 0} onClick={() => commands.findStep(1)}>
        <ChevronDown size={15} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Close (Esc)" onClick={commands.closeFind}>
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** The matches on one page; the current one is scrolled into view. */
export function FindHighlights({ pageNum }: { pageNum: number }) {
  const find = useSessionStore((s) => s.find);
  const currentRef = useRef<HTMLDivElement>(null);
  const current = find.matches[find.index];
  const isCurrentPage = find.open && current?.page === pageNum;
  useEffect(() => {
    if (isCurrentPage) currentRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [isCurrentPage, find.index, find.matches]);
  if (!find.open || find.matches.length === 0) return null;
  return (
    <div className="find-highlights" aria-hidden="true">
      {find.matches.map((m, i) =>
        m.page !== pageNum ? null : (
          <div
            key={i}
            ref={i === find.index ? currentRef : undefined}
            className={`find-hit${i === find.index ? " is-current" : ""}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
          />
        )
      )}
    </div>
  );
}
