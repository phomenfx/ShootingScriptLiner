/*
 * Box shapes on one script page: drawing them, and the select tool's move,
 * resize and rotate handles. The page layer calls into this before and after
 * its own line and note handling, so lines and notes stay on top.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { newId } from "../../lib/ids";
import { renderLineCap } from "../../lib/lineCaps";
import {
  hitsShape,
  pathBox,
  simplifyPoints,
  isShapeShown,
  MIN_SHAPE_PT,
  outlineEdges,
  resizeShape,
  rotationToward,
  shapeCenter,
  shapeColor,
  shapeFill,
  shapeHandles,
  shapeHalo,
  shapeHasStroke,
  shapeOutline,
  stampScalePercent,
  stampTip,
  type ShapeHandle,
} from "../../lib/shapeGeometry";
import { segmentStrands } from "../../lib/strokeGeometry";
import * as edits from "../../model/edits";
import type { ImageMark, Project, ShapeMark } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useAssetStore } from "../../lib/assetStore";
import type { LineCap } from "../../types/annotations";

type Pt = { x: number; y: number };

type ShapeDrag =
  | { type: "draw"; start: Pt }
  | { type: "move"; origin: ShapeMark; start: Pt }
  | { type: "resize"; origin: ShapeMark; handle: Extract<ShapeHandle, { kind: "resize" }> }
  | { type: "rotate"; origin: ShapeMark }
  | { type: "image-move"; origin: ImageMark; start: Pt }
  | { type: "image-resize"; origin: ImageMark; handle: Extract<ShapeHandle, { kind: "resize" }> };

const HANDLE_PX = 5;
const ROTATE_GAP_PX = 22;
const DEFAULT_BOX = { widthPt: 96, heightPt: 60 };
const HIGHLIGHT_COLOR = "#FFE14D";

/** A new shape of the chosen kind, linked to the selected shot when there is one. */
function newShape(project: Project, page: number, box: { x: number; y: number; widthPt: number; heightPt: number }, kind: string, shotId?: string): ShapeMark {
  const d = project.settings.markDefaults.shape;
  const shape: ShapeMark = { id: newId(), kind: "shape", page, shape: kind, ...box, rotation: 0 };
  if (d.stroke) shape.stroke = { ...d.stroke };
  if (d.fill) shape.fill = { ...d.fill };
  if (d.outline) shape.outline = { ...d.outline };
  if (kind === "polygon") shape.sides = 6;
  if (kind === "star") {
    shape.points = 5;
    shape.innerDepthPct = 50;
  }
  if (kind === "stamp") {
    shape.stamp = "arrow";
    shape.fill = { opacityPct: 100 };
  }
  if (kind === "highlight") {
    shape.color = d.highlightColor ?? HIGHLIGHT_COLOR;
    // Full strength: the highlight layer multiplies, so the text shows through like a highlighter.
    shape.fill = { opacityPct: 100 };
  } else if (shotId && edits.findShot(project, shotId)) shape.shotId = shotId;
  else shape.color = project.settings.general.newShotColor;
  return shape;
}

/** SVG for one shape, in page pixels at `k` pixels per point. */
export function ShapeGraphic({ project, shape, k }: { project: Project; shape: ShapeMark; k: number }) {
  const color = shapeColor(project, shape);
  if (shape.shape === "stamp") {
    const ending = { cap: (shape.stamp ?? "arrow") as LineCap, scalePercent: stampScalePercent(shape), filled: !!shape.fill };
    const widthPt = shape.stroke?.widthPt ?? 2;
    const angle = (shape.rotation * Math.PI) / 180;
    const cap = renderLineCap(ending, color, widthPt * k, angle, false, k);
    const halo = shapeHalo(shape);
    // The ending drawn again underneath, in the outline color and thicker.
    const under = halo ? renderLineCap(ending, halo.color, (widthPt + (halo.widthPt * 2.5)) * k, angle, false, k) : null;
    const tip = stampTip(shape);
    return cap ? (
      <g transform={`translate(${tip.x * k}, ${tip.y * k})`}>
        {under?.elements}
        {cap.elements}
      </g>
    ) : null;
  }
  const outline = shapeOutline(shape);
  if (!outline) return null;
  const fill = shapeFill(project, shape);
  const points = outline.points.map((p) => `${p.x * k},${p.y * k}`).join(" ");
  const stroke = shapeHasStroke(shape) ? shape.stroke! : null;
  const halo = shapeHalo(shape);
  const strands = stroke ? outlineEdges(outline).flatMap(([a, b]) => segmentStrands(a, b, stroke.pattern, stroke.widthPt, stroke)) : [];
  const drawStrands = (ink: string, extraPt: number, key: string) =>
    strands.map((strand, index) => (
      <polyline
        key={`${key}-${index}`}
        points={strand.points.map((p) => `${p.x * k},${p.y * k}`).join(" ")}
        fill="none"
        stroke={ink}
        strokeWidth={(strand.widthPt + extraPt) * k}
        strokeDasharray={strand.dash?.map((part) => part * k).join(" ")}
        strokeOpacity={strand.opacity}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    ));
  return (
    <g>
      {/* A fill with no stroke still gets its outline around the edge. */}
      {halo && !stroke && fill && outline.closed && (
        <polygon points={points} fill="none" stroke={halo.color} strokeWidth={halo.widthPt * 2 * k} strokeLinejoin="round" />
      )}
      {fill && outline.closed && <polygon points={points} fill={fill.color} fillOpacity={fill.opacity} stroke="none" />}
      {halo && drawStrands(halo.color, halo.widthPt * 2, "halo")}
      {drawStrands(color, 0, "stroke")}
    </g>
  );
}

export function useShapeGestures({
  pageNum,
  width,
  selectedId,
  selectedIds = [],
  snapDegrees,
}: {
  pageNum: number;
  width: number;
  selectedId: string | undefined;
  /** Every selected mark; with several, each selected shape gets a dashed box. */
  selectedIds?: string[];
  snapDegrees: number | null | undefined;
}) {
  const project = useProjectStore((s) => s.project);
  const shapeKind = useSessionStore((s) => s.shapeKind);
  // The same click distance as lines (Settings → Interaction).
  const clickPx = usePrefsStore((s) => s.lineHitTolerancePx);
  const linkedShotId = useSessionStore((s) => (s.selection?.kind === "shot" ? s.selection.ids[0] : undefined));
  const page = project.script?.pages[pageNum - 1];
  const widthPt = page?.widthPt ?? 612;
  const heightPt = page?.heightPt ?? 792;
  const k = width / widthPt;
  const shapes = project.marks.filter((m): m is ShapeMark => m.kind === "shape" && m.page === pageNum && isShapeShown(project, m));
  const selected = shapes.find((shape) => shape.id === selectedId) ?? null;

  /* Images: an unrotated box whose height follows the picture's proportions. */
  const urls = useAssetStore((s) => s.urls);
  const images = project.marks.filter((m): m is ImageMark => m.kind === "image" && m.page === pageNum);
  const imageBox = (img: ImageMark): ShapeMark => {
    const asset = project.assets.find((a) => a.id === img.assetId);
    const heightPt = asset && asset.widthPx > 0 ? img.widthPt * (asset.heightPx / asset.widthPx) : img.widthPt;
    return { id: img.id, kind: "shape", page: img.page, shape: "rectangle", x: img.x, y: img.y, widthPt: img.widthPt, heightPt, rotation: 0 };
  };
  const selectedImage = images.find((img) => img.id === selectedId) ?? null;
  const replaceImage = (img: ImageMark) => useProjectStore.getState().apply(edits.replaceMark(img));

  const dragRef = useRef<ShapeDrag | null>(null);
  const [preview, setPreview] = useState<ShapeMark | null>(null);

  /** Normalized page point (0–1) to PDF points. */
  const toPt = (n: Pt): Pt => ({ x: n.x * widthPt, y: n.y * heightPt });
  const capture = (e: ReactPointerEvent) => (e.currentTarget as Element).setPointerCapture(e.pointerId);
  const activeTool = useSessionStore((s) => s.activeTool);

  /* ---------- Pen and Polygon: a path drawn point by point ---------- */

  // The path being drawn, in page points, and where the pointer is (the next Polygon corner).
  const [draft, setDraft] = useState<{ points: Pt[]; hover?: Pt } | null>(null);
  const penRef = useRef<{ points: Pt[]; straight: boolean } | null>(null);
  const polyRef = useRef<Pt[] | null>(null);

  const addPath = (points: Pt[], closed: boolean) => {
    const box = pathBox(points);
    const shape = newShape(project, pageNum, box, "path", linkedShotId);
    shape.path = { points: box.path, closed };
    breakUndoGroup();
    useProjectStore.getState().apply(edits.addMarks([shape]));
    breakUndoGroup();
    useSessionStore.getState().select("mark", shape.id);
  };

  /** Snaps the edge from `from` to the usual angles, as lines do (Shift snaps when Snap is off). */
  const snapFrom = (from: Pt | undefined, p: Pt, shift: boolean): Pt => {
    const step = snapDegrees ?? (shift ? 15 : null);
    if (!from || !step) return p;
    const len = Math.hypot(p.x - from.x, p.y - from.y);
    const angle = Math.round((Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI / step) * step * (Math.PI / 180);
    return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
  };

  /** Pen tool: starts a freehand stroke. */
  const startPen = (n: Pt, e: ReactPointerEvent) => {
    const p = toPt(n);
    penRef.current = { points: [p], straight: false };
    setDraft({ points: [p] });
    capture(e);
  };

  const finishPoly = (closed: boolean) => {
    const points = polyRef.current;
    polyRef.current = null;
    setDraft(null);
    if (points && points.length >= 2) addPath(points, closed && points.length >= 3);
  };

  /** Polygon tool: each click adds a corner; clicking the first corner closes the shape. */
  const polyClick = (n: Pt, e: ReactPointerEvent) => {
    const raw = toPt(n);
    const points = polyRef.current;
    if (!points) {
      polyRef.current = [raw];
      setDraft({ points: [raw], hover: raw });
      return;
    }
    const first = points[0]!;
    if (points.length >= 3 && Math.hypot(first.x - raw.x, first.y - raw.y) <= 7 / k) {
      finishPoly(true);
      return;
    }
    const last = points[points.length - 1]!;
    const p = snapFrom(last, raw, e.shiftKey);
    // A double-click lands twice on the same spot; keep one corner.
    if (Math.hypot(last.x - p.x, last.y - p.y) < 1 / k) return;
    points.push(p);
    setDraft({ points: [...points], hover: p });
  };

  // Polygon keys while drawing: Enter finishes it open, Escape cancels, Backspace removes the last corner.
  useEffect(() => {
    if (!draft || !polyRef.current) return;
    const onKey = (e: KeyboardEvent) => {
      const points = polyRef.current;
      if (!points) return;
      if (e.key === "Enter") finishPoly(false);
      else if (e.key === "Escape") {
        polyRef.current = null;
        setDraft(null);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        points.pop();
        if (points.length === 0) {
          polyRef.current = null;
          setDraft(null);
        } else setDraft({ points: [...points], hover: draft.hover });
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Switching tools drops a polygon in progress.
  useEffect(() => {
    if (activeTool !== "polygon" && polyRef.current) {
      polyRef.current = null;
      setDraft(null);
    }
  }, [activeTool]);
  const replace = (shape: ShapeMark) => useProjectStore.getState().apply(edits.replaceMark(shape));

  const boxFrom = (a: Pt, b: Pt, square: boolean) => {
    let w = b.x - a.x;
    let h = b.y - a.y;
    if (square) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side;
    }
    return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), widthPt: Math.abs(w), heightPt: Math.abs(h) };
  };

  /** Shape tool: starts drawing a box. */
  const startDraw = (n: Pt, e: ReactPointerEvent) => {
    dragRef.current = { type: "draw", start: toPt(n) };
    setPreview(null);
    capture(e);
  };

  /** Select tool, before lines and notes: grabs a handle of the selected shape. */
  const grabHandle = (n: Pt, e: ReactPointerEvent): boolean => {
    if (!selected && selectedImage) {
      // Images resize from their corners only, keeping their proportions.
      const p = toPt(n);
      const reach = (HANDLE_PX + 3) / k;
      const hit = shapeHandles(imageBox(selectedImage), 0).find(
        (h) => h.handle.kind === "resize" && h.handle.sx !== 0 && h.handle.sy !== 0 && Math.hypot(h.at.x - p.x, h.at.y - p.y) <= reach
      );
      if (!hit || hit.handle.kind !== "resize") return false;
      breakUndoGroup();
      dragRef.current = { type: "image-resize", origin: selectedImage, handle: hit.handle };
      capture(e);
      return true;
    }
    if (!selected) return false;
    const p = toPt(n);
    const reach = (HANDLE_PX + 3) / k;
    const hit = shapeHandles(selected, ROTATE_GAP_PX / k).find((h) => Math.hypot(h.at.x - p.x, h.at.y - p.y) <= reach);
    if (!hit) return false;
    breakUndoGroup();
    dragRef.current = hit.handle.kind === "rotate" ? { type: "rotate", origin: selected } : { type: "resize", origin: selected, handle: hit.handle };
    capture(e);
    return true;
  };

  /** Select tool, after lines and notes: picks the top shape under the pointer and starts moving it. */
  const grabShape = (n: Pt, e: ReactPointerEvent): boolean => {
    const p = toPt(n);
    const hit = [...shapes].reverse().find((shape) => hitsShape(shape, p, clickPx / k));
    if (!hit) {
      // Images sit under shapes, so they are tried last.
      const img = [...images].reverse().find((image) => hitsShape(imageBox(image), p, 0));
      if (!img) return false;
      useSessionStore.getState().select("mark", img.id);
      breakUndoGroup();
      dragRef.current = { type: "image-move", origin: img, start: p };
      capture(e);
      return true;
    }
    useSessionStore.getState().select("mark", hit.id);
    breakUndoGroup();
    dragRef.current = { type: "move", origin: hit, start: p };
    capture(e);
    return true;
  };

  /** Shapes whose box touches a box given in page points. */
  const shapesInBox = (a: Pt, b: Pt): string[] =>
    [...shapes, ...images.map(imageBox)]
      .filter((shape) => {
        const corners = shapeHandles(shape, 0).filter((h) => h.handle.kind === "resize").map((h) => h.at);
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        return Math.min(...xs) <= b.x && Math.max(...xs) >= a.x && Math.min(...ys) <= b.y && Math.max(...ys) >= a.y;
      })
      .map((shape) => shape.id);

  /** The top shape under a normalized page point, if any. */
  const shapeAt = (n: Pt): { id: string } | null => {
    const p = toPt(n);
    return (
      [...shapes].reverse().find((shape) => hitsShape(shape, p, clickPx / k)) ??
      [...images].reverse().find((image) => hitsShape(imageBox(image), p, 0)) ??
      null
    );
  };

  /** Returns true when a shape gesture used the event. */
  const move = (n: Pt, e: ReactPointerEvent): boolean => {
    const pen = penRef.current;
    if (pen) {
      const p = toPt(n);
      const last = pen.points[pen.points.length - 1]!;
      if (e.shiftKey) {
        // Shift draws a straight segment: the last point follows the pointer.
        if (!pen.straight) pen.points.push(p);
        else pen.points[pen.points.length - 1] = p;
        pen.straight = true;
      } else {
        pen.straight = false;
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 1 / k) pen.points.push(p);
      }
      setDraft({ points: [...pen.points] });
      return true;
    }
    if (polyRef.current) {
      const points = polyRef.current;
      setDraft({ points: [...points], hover: snapFrom(points[points.length - 1], toPt(n), e.shiftKey) });
      return true;
    }
    const drag = dragRef.current;
    if (!drag) return false;
    const p = toPt(n);
    if (drag.type === "draw") {
      setPreview(newShape(project, pageNum, boxFrom(drag.start, p, e.shiftKey), shapeKind, linkedShotId));
    } else if (drag.type === "image-move") {
      replaceImage({ ...drag.origin, x: drag.origin.x + p.x - drag.start.x, y: drag.origin.y + p.y - drag.start.y });
    } else if (drag.type === "image-resize") {
      const box = resizeShape(imageBox(drag.origin), drag.handle, p, true);
      replaceImage({ ...drag.origin, x: box.x, y: box.y, widthPt: box.widthPt });
    } else if (drag.type === "move") {
      replace({ ...drag.origin, x: drag.origin.x + p.x - drag.start.x, y: drag.origin.y + p.y - drag.start.y });
    } else if (drag.type === "resize") {
      replace(resizeShape(drag.origin, drag.handle, p, e.shiftKey));
    } else {
      replace({ ...drag.origin, rotation: rotationToward(drag.origin, p, e.shiftKey ? 15 : (snapDegrees ?? undefined)) });
    }
    return true;
  };

  const up = (n: Pt, e: ReactPointerEvent): boolean => {
    const pen = penRef.current;
    if (pen) {
      penRef.current = null;
      setDraft(null);
      // Fewer points, same look: drop those within a fraction of a point of the stroke.
      const points = simplifyPoints(pen.points, 0.6);
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (points.length >= 2 && extent >= 2) addPath(points, false);
      return true;
    }
    if (polyRef.current) return true;
    const drag = dragRef.current;
    if (!drag) return false;
    dragRef.current = null;
    setPreview(null);
    if (drag.type === "draw") {
      const p = toPt(n);
      let box = boxFrom(drag.start, p, e.shiftKey);
      if (box.widthPt < MIN_SHAPE_PT && box.heightPt < MIN_SHAPE_PT) {
        // A click makes a shape of the usual size centered on the pointer.
        box = { x: drag.start.x - DEFAULT_BOX.widthPt / 2, y: drag.start.y - DEFAULT_BOX.heightPt / 2, ...DEFAULT_BOX };
      }
      box.widthPt = Math.max(MIN_SHAPE_PT, box.widthPt);
      box.heightPt = Math.max(MIN_SHAPE_PT, box.heightPt);
      const shape = newShape(project, pageNum, box, shapeKind, linkedShotId);
      breakUndoGroup();
      useProjectStore.getState().apply(edits.addMarks([shape]));
      breakUndoGroup();
      useSessionStore.getState().select("mark", shape.id);
    } else {
      breakUndoGroup();
    }
    return true;
  };

  const isHighlight = (shape: ShapeMark) => shape.shape === "highlight";
  const draftShot = linkedShotId ? edits.findShot(project, linkedShotId) : null;
  const draftColor = draftShot?.shot.color ?? project.settings.general.newShotColor;
  const draftWidth = project.settings.markDefaults.shape.stroke?.widthPt ?? 2;
  const draftPoints = draft ? [...draft.points, ...(draft.hover ? [draft.hover] : [])] : [];
  const nearFirst =
    !!draft?.hover && draft.points.length >= 3 && Math.hypot(draft.points[0]!.x - draft.hover.x, draft.points[0]!.y - draft.hover.y) <= 7 / k;
  const draftLayer: ReactNode = draft ? (
    <g className="path-draft" pointerEvents="none">
      <polyline
        points={draftPoints.map((p) => `${p.x * k},${p.y * k}`).join(" ")}
        fill="none"
        stroke={draftColor}
        strokeWidth={draftWidth * k}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {draft.hover &&
        draft.points.map((p, i) => (
          <circle key={i} cx={p.x * k} cy={p.y * k} r={i === 0 && nearFirst ? 6 : 3} fill="#ffffff" stroke="#4a9eff" strokeWidth={1.5} />
        ))}
    </g>
  ) : null;
  const shapesLayer: ReactNode = (
    <g className="shape-layer">
      {images.map((img) => {
        const box = imageBox(img);
        const url = urls[img.assetId];
        return url ? (
          <image key={img.id} href={url} x={box.x * k} y={box.y * k} width={box.widthPt * k} height={box.heightPt * k} preserveAspectRatio="none" />
        ) : (
          // The picture file is missing: keep its place visible.
          <rect key={img.id} x={box.x * k} y={box.y * k} width={box.widthPt * k} height={box.heightPt * k} fill="#9e9e9e" fillOpacity={0.25} stroke="#9e9e9e" strokeDasharray="4 3" />
        );
      })}
      {shapes.filter((shape) => !isHighlight(shape)).map((shape) => (
        <ShapeGraphic key={shape.id} project={project} shape={shape} k={k} />
      ))}
      {preview && !isHighlight(preview) && (
        <g opacity={0.7}>
          <ShapeGraphic project={project} shape={preview} k={k} />
        </g>
      )}
      {draftLayer}
    </g>
  );

  /*
   * Highlights get their own layer just above the page image. The whole layer
   * multiplies with the page, so the script text stays dark under the color.
   */
  const highlights = shapes.filter(isHighlight);
  const highlightLayer: ReactNode =
    highlights.length > 0 || (preview && isHighlight(preview)) ? (
      <svg className="highlight-layer" width={width} height={width * (heightPt / widthPt)} aria-hidden="true">
        {highlights.map((shape) => (
          <ShapeGraphic key={shape.id} project={project} shape={shape} k={k} />
        ))}
        {preview && isHighlight(preview) && <ShapeGraphic project={project} shape={preview} k={k} />}
      </svg>
    ) : null;

  const multi = selectedIds.length > 1 ? [...shapes, ...images.map(imageBox)].filter((shape) => selectedIds.includes(shape.id)) : [];
  const multiLayer: ReactNode = multi.length ? (
    <g className="shape-multi" pointerEvents="none">
      {multi.map((shape) => {
        const corners = shapeHandles(shape, 0)
          .filter((h) => h.handle.kind === "resize" && h.handle.sx !== 0 && h.handle.sy !== 0)
          .map((h) => h.at);
        const c = shapeCenter(shape);
        corners.sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x));
        return (
          <polygon key={shape.id} points={corners.map((p) => `${p.x * k},${p.y * k}`).join(" ")} fill="none" stroke="#4a9eff" strokeWidth={1.25} strokeDasharray="4 3" />
        );
      })}
    </g>
  ) : null;

  const imageHandles: ReactNode = selectedImage
    ? (() => {
        const box = imageBox(selectedImage);
        const corners = shapeHandles(box, 0).filter((h) => h.handle.kind === "resize" && h.handle.sx !== 0 && h.handle.sy !== 0);
        return (
          <g className="shape-handles" pointerEvents="none">
            <rect x={box.x * k} y={box.y * k} width={box.widthPt * k} height={box.heightPt * k} fill="none" stroke="#4a9eff" strokeWidth={1} strokeDasharray="4 3" />
            {corners.map((h, i) => (
              <rect key={i} x={h.at.x * k - HANDLE_PX} y={h.at.y * k - HANDLE_PX} width={HANDLE_PX * 2} height={HANDLE_PX * 2} fill="#ffffff" stroke="#4a9eff" strokeWidth={1.5} />
            ))}
          </g>
        );
      })()
    : null;

  const handlesLayer: ReactNode = selected ? (
    <g className="shape-handles" pointerEvents="none">
      <polygon
        points={shapeHandles(selected, 0)
          .filter((h) => h.handle.kind === "resize" && h.handle.sx !== 0 && h.handle.sy !== 0)
          .map((h) => h.at)
          .sort((a, b) => Math.atan2(a.y - shapeCenter(selected).y, a.x - shapeCenter(selected).x) - Math.atan2(b.y - shapeCenter(selected).y, b.x - shapeCenter(selected).x))
          .map((p) => `${p.x * k},${p.y * k}`)
          .join(" ")}
        fill="none"
        stroke="#4a9eff"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {(() => {
        const handles = shapeHandles(selected, ROTATE_GAP_PX / k);
        const rotate = handles.find((h) => h.handle.kind === "rotate")!;
        const top = handles.find((h) => h.handle.kind === "resize" && h.handle.sx === 0 && h.handle.sy === -1)!;
        return (
          <>
            <line x1={top.at.x * k} y1={top.at.y * k} x2={rotate.at.x * k} y2={rotate.at.y * k} stroke="#4a9eff" strokeWidth={1} />
            {handles.map((h, i) =>
              h.handle.kind === "rotate" ? (
                <circle key={i} cx={h.at.x * k} cy={h.at.y * k} r={HANDLE_PX} fill="#ffffff" stroke="#4a9eff" strokeWidth={1.5} />
              ) : (
                <rect key={i} x={h.at.x * k - HANDLE_PX} y={h.at.y * k - HANDLE_PX} width={HANDLE_PX * 2} height={HANDLE_PX * 2} fill="#ffffff" stroke="#4a9eff" strokeWidth={1.5} />
              )
            )}
          </>
        );
      })()}
    </g>
  ) : null;

  return { startDraw, startPen, polyClick, finishPoly, grabHandle, grabShape, shapeAt, shapesInBox, move, up, shapesLayer, highlightLayer, handlesLayer: multiLayer ?? handlesLayer ?? imageHandles };
}
