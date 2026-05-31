import { useEffect, type RefObject } from "react";
import { useProjectStore } from "../stores/projectStore";
import { VIEWER_ZOOM_STEP_PERCENT } from "../types/appPreferences";

/** Ctrl/Cmd + wheel over the PDF area adjusts zoom. */
export function usePdfZoomWheel(wrapRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const adjustViewerZoom = useProjectStore((s) => s.adjustViewerZoom);

  useEffect(() => {
    if (!enabled) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -VIEWER_ZOOM_STEP_PERCENT : VIEWER_ZOOM_STEP_PERCENT;
      adjustViewerZoom(delta);
    };

    const el = wrapRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, [wrapRef, enabled, adjustViewerZoom]);
}
