import { useRef } from "react";
import {
  MAX_PANEL_WIDTH_PX,
  MIN_PANEL_WIDTH_PX,
  draggedPanelWidthPx,
} from "../../lib/panelLayout";

type PanelResizerProps = {
  label: string;
  side: "left" | "right";
  widthPx: number;
  onResize: (widthPx: number) => void;
  onReset: () => void;
};

const KEY_STEP_PX = 16;

/** The inner edge of a side panel: drag to resize, double-click to reset, arrow keys to nudge. */
export function PanelResizer({ label, side, widthPx, onResize, onReset }: PanelResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const lastClickAt = useRef(0);

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    const dragging = drag.current;
    const moved = dragging !== null && Math.abs(e.clientX - dragging.startX) > 4;
    const now = e.timeStamp;
    if (!moved && now - lastClickAt.current < 400) {
      lastClickAt.current = 0;
      onReset();
    } else if (!moved) {
      lastClickAt.current = now;
    } else {
      lastClickAt.current = 0;
    }
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove("panel-resizing");
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="panel-resizer"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={widthPx}
      aria-valuemin={MIN_PANEL_WIDTH_PX}
      aria-valuemax={MAX_PANEL_WIDTH_PX}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { startX: e.clientX, startWidth: widthPx };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add("panel-resizing");
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onResize(draggedPanelWidthPx(side, drag.current.startWidth, drag.current.startX, e.clientX));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const towardCenter = (e.key === "ArrowRight") === (side === "left");
        onResize(widthPx + (towardCenter ? KEY_STEP_PX : -KEY_STEP_PX));
      }}
    />
  );
}
