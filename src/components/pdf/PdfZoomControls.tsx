import { useEffect, useState } from "react";
import { Expand, Minus, Plus } from "lucide-react";
import * as commands from "../../commands";
import {
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_VIEWER_ZOOM_PERCENT,
  VIEWER_ZOOM_STEP_PERCENT,
} from "../../types/appPreferences";
import { usePrefsStore } from "../../stores/prefsStore";

/** Zoom out, a typed percent, zoom in, and fit. Sits at the right of the script bottom bar. */
export function PdfZoomControls() {
  const viewerZoomPercent = usePrefsStore((s) => s.viewerZoomPercent);
  const setViewerZoomPercent = usePrefsStore((s) => s.setViewerZoomPercent);
  const [draft, setDraft] = useState(String(viewerZoomPercent));

  useEffect(() => {
    setDraft(String(viewerZoomPercent));
  }, [viewerZoomPercent]);

  const commitDraft = () => {
    const raw = draft.replace(/%/g, "").trim();
    if (raw === "") {
      setDraft(String(viewerZoomPercent));
      return;
    }
    setViewerZoomPercent(Number(raw));
  };

  return (
    <div className="script-zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="script-iconbtn"
        title="Zoom out"
        disabled={viewerZoomPercent <= MIN_VIEWER_ZOOM_PERCENT}
        onClick={() => setViewerZoomPercent(viewerZoomPercent - VIEWER_ZOOM_STEP_PERCENT)}
      >
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <label className="script-field script-zoom-field">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label="Zoom percent"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setDraft(String(viewerZoomPercent));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span>%</span>
      </label>
      <button
        type="button"
        className="script-iconbtn"
        title="Zoom in"
        disabled={viewerZoomPercent >= MAX_VIEWER_ZOOM_PERCENT}
        onClick={() => setViewerZoomPercent(viewerZoomPercent + VIEWER_ZOOM_STEP_PERCENT)}
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="script-iconbtn"
        title="Fit page (Ctrl+0)"
        aria-pressed={viewerZoomPercent === 100}
        onClick={() => commands.zoomToFit()}
      >
        <Expand size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
