/*
 * Pen and touch on the script.
 *
 * - A pen draws and selects like a mouse. Once a pen has been used, fingers
 *   scroll instead (Settings > Interaction can make fingers always draw or
 *   always scroll).
 * - Two fingers pinch to zoom and drag to scroll; a finger that had started a
 *   gesture is cancelled so nothing is drawn.
 * - A single finger is held back for a moment before the drawing layer sees
 *   it, so a second finger can still turn it into a pinch.
 */
import { useEffect, type RefObject } from "react";
import { usePrefsStore } from "../stores/prefsStore";
import { useSessionStore } from "../stores/sessionStore";

/** How long a single finger waits for a second one before it acts. */
const HOLD_MS = 90;
/** Movement that ends the wait early (or starts a scroll). */
const SLOP_PX = 6;

type Touch = { id: number; x: number; y: number; startX: number; startY: number; target: EventTarget | null; state: "held" | "passed" | "pan" | "pinch"; timer?: number };

const synthetic = new WeakSet<Event>();

function redispatch(target: EventTarget | null, type: string, t: { id: number; x: number; y: number }) {
  if (!target) return;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: t.x,
    clientY: t.y,
    pointerId: t.id,
    pointerType: "touch",
    isPrimary: true,
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    pressure: type === "pointerup" ? 0 : 0.5,
  });
  synthetic.add(event);
  target.dispatchEvent(event);
}

export function useTouchGestures(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const touches = new Map<number, Touch>();
    let pinch: { dist: number; zoom: number; midX: number; midY: number } | null = null;

    const scroller = () => root.querySelector<HTMLElement>(".pdf-canvas-wrap");
    const onLayer = (target: EventTarget | null) => target instanceof Element && !!target.closest(".annotation-layer");
    const fingersScroll = () => {
      const mode = usePrefsStore.getState().touchFingers;
      return mode === "pan" || (mode === "auto" && useSessionStore.getState().stylusSeen);
    };
    const pair = () => [...touches.values()].slice(0, 2);
    const pinchInfo = () => {
      const [a, b] = pair();
      return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2 };
    };

    const handOff = (t: Touch) => {
      if (t.state !== "held") return;
      window.clearTimeout(t.timer);
      t.state = "passed";
      redispatch(t.target, "pointerdown", { id: t.id, x: t.startX, y: t.startY });
      if (t.x !== t.startX || t.y !== t.startY) redispatch(t.target, "pointermove", t);
    };

    const onDown = (e: PointerEvent) => {
      if (synthetic.has(e)) return;
      if (e.pointerType === "pen") {
        if (!useSessionStore.getState().stylusSeen) useSessionStore.getState().setStylusSeen(true);
        return;
      }
      if (e.pointerType !== "touch") return;
      const t: Touch = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, target: e.target, state: "held" };
      touches.set(e.pointerId, t);
      if (touches.size >= 2) {
        // A second finger: whatever the first one started becomes a pinch.
        for (const other of touches.values()) {
          window.clearTimeout(other.timer);
          if (other.state === "passed") redispatch(other.target, "pointercancel", other);
          other.state = "pinch";
        }
        const info = pinchInfo();
        pinch = { ...info, zoom: usePrefsStore.getState().viewerZoomPercent };
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (!onLayer(e.target)) {
        touches.delete(e.pointerId);
        return;
      }
      e.stopPropagation();
      if (fingersScroll()) {
        t.state = "pan";
        return;
      }
      t.timer = window.setTimeout(() => handOff(t), HOLD_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (synthetic.has(e)) return;
      const t = touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      t.x = e.clientX;
      t.y = e.clientY;
      if (t.state === "passed") return;
      e.stopPropagation();
      e.preventDefault();
      if (t.state === "pinch" && pinch && touches.size >= 2) {
        const info = pinchInfo();
        const wrap = scroller();
        if (wrap) {
          wrap.scrollLeft -= info.midX - pinch.midX;
          wrap.scrollTop -= info.midY - pinch.midY;
        }
        pinch.midX = info.midX;
        pinch.midY = info.midY;
        if (pinch.dist > 0) usePrefsStore.getState().setViewerZoomPercent(Math.round(pinch.zoom * (info.dist / pinch.dist)));
        return;
      }
      if (t.state === "pan") {
        const wrap = scroller();
        if (wrap) {
          wrap.scrollLeft -= dx;
          wrap.scrollTop -= dy;
        }
        return;
      }
      if (t.state === "held" && Math.hypot(t.x - t.startX, t.y - t.startY) > SLOP_PX) handOff(t);
    };

    const onUp = (e: PointerEvent) => {
      if (synthetic.has(e)) return;
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      window.clearTimeout(t.timer);
      if (touches.size < 2) pinch = null;
      if (t.state === "passed") return;
      e.stopPropagation();
      const tapped = Math.hypot(t.x - t.startX, t.y - t.startY) <= SLOP_PX;
      if (t.state === "held" && e.type === "pointerup") {
        // A quick tap: the drawing layer gets it whole.
        handOff(t);
        redispatch(t.target, "pointerup", t);
      } else if (t.state === "pan" && tapped && e.type === "pointerup" && useSessionStore.getState().activeTool === "select") {
        // Scrolling fingers still select with a tap.
        redispatch(t.target, "pointerdown", t);
        redispatch(t.target, "pointerup", t);
      }
      // Any other finger left over from a pinch just stops.
      for (const other of touches.values()) if (other.state === "pinch") other.state = "pan";
    };

    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("pointermove", onMove, true);
    root.addEventListener("pointerup", onUp, true);
    root.addEventListener("pointercancel", onUp, true);
    return () => {
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("pointermove", onMove, true);
      root.removeEventListener("pointerup", onUp, true);
      root.removeEventListener("pointercancel", onUp, true);
      for (const t of touches.values()) window.clearTimeout(t.timer);
    };
  }, [rootRef]);
}

/** Holding a finger still opens the right-click menu, anywhere in the app. */
export function useLongPress() {
  useEffect(() => {
    let timer: number | undefined;
    let start: { x: number; y: number; target: EventTarget | null } | null = null;
    let native = false;
    const clear = () => {
      window.clearTimeout(timer);
      start = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || synthetic.has(e)) return;
      clear();
      native = false;
      start = { x: e.clientX, y: e.clientY, target: e.target };
      timer = window.setTimeout(() => {
        // Some browsers send their own; only make one when they don't.
        if (!start || native) return;
        const el = document.elementFromPoint(start.x, start.y) ?? (start.target as Element | null);
        el?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
        clear();
      }, 600);
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
    };
    const onNative = () => {
      native = true;
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", clear, true);
    document.addEventListener("pointercancel", clear, true);
    document.addEventListener("contextmenu", onNative, true);
    return () => {
      clear();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", clear, true);
      document.removeEventListener("pointercancel", clear, true);
      document.removeEventListener("contextmenu", onNative, true);
    };
  }, []);
}
