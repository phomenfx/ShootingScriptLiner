import { useEffect, useState } from "react";
import {
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_VIEWER_ZOOM_PERCENT,
  VIEWER_ZOOM_STEP_PERCENT,
} from "../../types/appPreferences";
import { useProjectStore } from "../../stores/projectStore";

export function PdfZoomControls() {
  const viewerZoomPercent = useProjectStore((s) => s.viewerZoomPercent);
  const setViewerZoomPercent = useProjectStore((s) => s.setViewerZoomPercent);
  const adjustViewerZoom = useProjectStore((s) => s.adjustViewerZoom);
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
    <div className="pdf-zoom-controls" role="group" aria-label="Zoom">
      <button
        type="button"
        title="Zoom out"
        disabled={viewerZoomPercent <= MIN_VIEWER_ZOOM_PERCENT}
        onClick={() => adjustViewerZoom(-VIEWER_ZOOM_STEP_PERCENT)}
      >
        −
      </button>
      <label className="pdf-zoom-input-wrap">
        <input
          type="text"
          inputMode="numeric"
          className="pdf-zoom-input"
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
        <span className="pdf-zoom-suffix">%</span>
      </label>
      <button
        type="button"
        title="Zoom in"
        disabled={viewerZoomPercent >= MAX_VIEWER_ZOOM_PERCENT}
        onClick={() => adjustViewerZoom(VIEWER_ZOOM_STEP_PERCENT)}
      >
        +
      </button>
    </div>
  );
}
