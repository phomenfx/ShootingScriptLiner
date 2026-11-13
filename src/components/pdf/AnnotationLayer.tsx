import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  annotationsForPage,
  cloneLine,
  createLineFromShot,
  getLineFontFamily,
  getLineFontSizePt,
  getLineLabelBold,
  getLineScriptLabels,
  getTextLabelBold,
  getTextDisplayText,
  resolveTextColor,
  isTextShown,
  isAnnotationVisible,
  lineEndIndexForContLabel,
  resolveLineStyle,
  textAnnotationsForPage,
} from "../../lib/annotationUtils";
import type { MarginTrimHint } from "../../lib/lineMarginContinuation";
import {
  clientToNormalizedUnclamped,
  clamp01,
  distance,
  normalizedToPx,
  activeSnapDegrees,
} from "../../lib/coords";
import { newId } from "../../lib/ids";
import * as commands from "../../commands";
import { legacyEnding, toLegacyProject } from "../../legacy/legacyView";
import { addLine, addLineJoined, addText, applyMarginContinuationTrim, replaceLine, selectMark, updateText } from "../../drawing/marks";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { shotIdLabel } from "../../model/shotList";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import type { LineAnnotation, NormalizedPoint, TextAlign, TextAnnotation } from "../../types/annotations";
import {
  primaryLabelAnchor,
  primaryLabelPositionPx,
  primaryLayoutForLine,
  secondaryLabelAnchor,
  secondaryLabelPositionPx,
  secondaryLayoutForLine,
  viewerScalePxPerPt,
} from "../../lib/labelLayout";
import { endingGeometry, shaftEnds } from "../../lib/geometry";
import { segmentStrands } from "../../lib/strokeGeometry";
import { segmentLook } from "../../model/segments";
import { actionBarPosition } from "../../lib/actionBarLayout";
import { lineAngleRad, renderLineCap } from "../../lib/lineCaps";
import { labelDragPatch } from "../../gestures/labelDrag";
import { useShapeGestures } from "./useShapeGestures";
import * as edits from "../../model/edits";
import type { Mark } from "../../model/types";
import { openContextMenu, type ContextMenuItem } from "../ContextMenu";
import { clonedLinePoints, closestOnLine, dragLinePoints, drawPreviewEnd, finishDrawEnd, type LineHandle } from "../../gestures/lineDrag";
import { noteMovePatch, noteResizePatch } from "../../gestures/noteDrag";
import { pickSelectTarget } from "../../gestures/priority";
import { ScriptActionBar } from "./ScriptActionBar";
import { ScriptTextBlock } from "./ScriptTextBlock";
import {
  layoutTextBlock,
  measureViewerText,
  pinBlockToOrigin,
  pointInFrame,
  viewerFontShorthand,
  type BoxHandle,
  type LaidOutRun,
  type TextFrame,
} from "../../lib/textBox";

type Props = {
  pageNum: number;
  width: number;
  height: number;
};

type DragMode =
  | { type: "draw"; start: NormalizedPoint }
  | { type: "handle"; lineId: string; handle: LineHandle; origin: LineAnnotation }
  | { type: "alt-clone"; lineId: string; origin: LineAnnotation; offset: NormalizedPoint }
  | {
      type: "note-move";
      origin: TextAnnotation;
      startPx: { x: number; y: number };
      startFrame: TextFrame;
    }
  | {
      type: "note-resize";
      handle: BoxHandle;
      origin: TextAnnotation;
      startPx: { x: number; y: number };
      startFrame: TextFrame;
    }
  | {
      type: "label-move";
      which: "primary" | "secondary";
      origin: LineAnnotation;
      startPx: { x: number; y: number };
      startFrame: TextFrame;
      anchor: { x: number; y: number };
    }
  | {
      type: "label-resize";
      which: "primary" | "secondary";
      handle: BoxHandle;
      origin: LineAnnotation;
      startPx: { x: number; y: number };
      startFrame: TextFrame;
      anchor: { x: number; y: number };
    }
  | null;

type PlacedLabel = {
  line: LineAnnotation;
  which: "primary" | "secondary";
  /** Line point the origin is offset from. */
  anchor: { x: number; y: number };
  align: TextAlign;
  frame: TextFrame;
  runs: LaidOutRun[];
  fill: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

type PlacedNote = {
  text: TextAnnotation;
  frame: TextFrame;
  runs: LaidOutRun[];
  fill: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

/** The system file picker for one JPG or PNG. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,image/jpeg,image/png";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const NO_IDS: string[] = [];

export function AnnotationLayer({ pageNum, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const v2Project = useProjectStore((s) => s.project);
  const project = useMemo(() => toLegacyProject(v2Project), [v2Project]);
  const activeTool = useSessionStore((s) => s.activeTool);
  const selectedIds = useSessionStore((s) => (s.selection?.kind === "mark" ? s.selection.ids : NO_IDS));
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // One mark: its handles, action bar and form. Several: they highlight and move together.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const cursorClass =
    activeTool === "line" || activeTool === "shape" || activeTool === "pen" || activeTool === "polygon" || activeTool === "image"
      ? "tool-draw"
      : activeTool === "text"
        ? "tool-text"
        : "tool-select";
  const pageHeightPt = useSessionStore((s) => s.scriptPageHeightPt);
  const snapDegrees = activeSnapDegrees(
    v2Project.settings.drawing.angleSnapDegrees,
    useSessionStore((s) => s.snapEnabled)
  );
  const lineHitTolerancePx = usePrefsStore((s) => s.lineHitTolerancePx);
  const showActionBar = usePrefsStore((s) => s.showActionBar);
  const setActivePage = useSessionStore((s) => s.setActivePage);
  const linkedShotId = useSessionStore((s) => (s.selection?.kind === "shot" ? s.selection.ids[0] : undefined));
  const lineSegment = useSessionStore((s) => s.lineSegment);
  const shapeGestures = useShapeGestures({ pageNum, width, selectedId, selectedIds, snapDegrees });

  /* ---------- several marks: drag box, toggle, move together ---------- */
  const ptPerPx = (v2Project.script?.pages[pageNum - 1]?.widthPt ?? 612) / Math.max(1, width);
  const groupRef = useRef<{ startPx: { x: number; y: number }; origins: Mark[] } | null>(null);
  const marqueeRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number }; add: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const toggleMark = (id: string) => {
    const ids = useSessionStore.getState().selection?.kind === "mark" ? useSessionStore.getState().selection!.ids : [];
    useSessionStore.getState().selectMarks(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const block = (event: Event) => event.preventDefault();
    svg.addEventListener("selectstart", block);
    svg.addEventListener("dragstart", block);
    return () => {
      svg.removeEventListener("selectstart", block);
      svg.removeEventListener("dragstart", block);
    };
  }, []);

  const dragRef = useRef<DragMode>(null);
  const [drag, setDragState] = useState<DragMode>(null);
  const setDrag = (next: DragMode) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [previewEnd, setPreviewEnd] = useState<NormalizedPoint | null>(null);

  const lines = annotationsForPage(project, pageNum).filter((l) =>
    isAnnotationVisible(project, l)
  );
  const texts = textAnnotationsForPage(project, pageNum);

  const getPointUnclamped = useCallback(
    (e: React.MouseEvent | MouseEvent | React.PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return clientToNormalizedUnclamped(e.clientX, e.clientY, rect);
    },
    []
  );

  const labelScale = viewerScalePxPerPt(height, pageHeightPt);

  // Outlines saved on the marks: a line's caption and a note each carry their own.
  const markById = useMemo(() => new Map(v2Project.marks.map((mark) => [mark.id, mark])), [v2Project.marks]);
  const captionOutlineOf = (id: string) => {
    const mark = markById.get(id);
    return mark?.kind === "line" ? mark.caption.outline : undefined;
  };
  const noteOutlineOf = (id: string) => {
    const mark = markById.get(id);
    return mark?.kind === "text" ? mark.outline : undefined;
  };
  const textHalo = (outline: { color: string; widthPt: number } | undefined) =>
    outline && outline.widthPt > 0 ? { color: outline.color, widthPx: outline.widthPt * labelScale } : undefined;

  const placedLabels: PlacedLabel[] = lines.flatMap((line) => {
    const labels = getLineScriptLabels(line, project);
    const startPoint = line.points[0];
    const endPoint = line.points[line.points.length - 1];
    if (!startPoint || !endPoint) return [];
    const p0 = normalizedToPx(startPoint, width, height);
    const p1 = normalizedToPx(endPoint, width, height);
    const fontSizePx = getLineFontSizePt(line, project) * labelScale;
    const fontFamily = getLineFontFamily(line, project);
    const bold = getLineLabelBold(line, project);
    const italic = line.labelItalic === true;
    const underline = line.labelUnderline === true;
    const fill = resolveLineStyle(line, project).color;
    const measure = (sample: string) =>
      measureViewerText(sample, viewerFontShorthand(fontFamily, fontSizePx, bold, italic));
    const place = (
      which: "primary" | "secondary",
      text: string,
      parent: { x: number; y: number },
      origin: { x: number; y: number },
      widthPt: number | undefined,
      minHeightPt: number | undefined,
      align: TextAlign
    ): PlacedLabel => {
      const laid = pinBlockToOrigin(
        layoutTextBlock({
          text,
          left: origin.x,
          baseline: origin.y,
          fontSize: fontSizePx,
          width: widthPt != null ? widthPt * labelScale : undefined,
          minHeight: minHeightPt != null ? minHeightPt * labelScale : undefined,
          align,
          underline,
          yDown: true,
          measure,
        }),
        align,
        origin,
        true
      );
      return {
        line,
        which,
        anchor: parent,
        align,
        frame: laid.frame,
        runs: laid.runs,
        fill,
        fontFamily,
        bold,
        italic,
      };
    };
    const placed: PlacedLabel[] = [];
    if (labels.primary) {
      const parent = primaryLabelAnchor(p0);
      const pos = primaryLabelPositionPx(parent, primaryLayoutForLine(line, project), labelScale);
      placed.push(
        place(
          "primary",
          labels.primary,
          parent,
          pos,
          line.labelWidthPt,
          line.labelMinHeightPt,
          line.labelAlign ?? "left"
        )
      );
    }
    if (labels.secondary) {
      const parent = secondaryLabelAnchor(p0, p1, lineEndIndexForContLabel(line));
      const pos = secondaryLabelPositionPx(
        parent,
        fontSizePx,
        secondaryLayoutForLine(line, project),
        labelScale
      );
      placed.push(
        place(
          "secondary",
          labels.secondary,
          parent,
          pos,
          line.secondaryWidthPt,
          line.secondaryMinHeightPt,
          line.secondaryAlign ?? "left"
        )
      );
    }
    return placed;
  });

  const placedNotes: PlacedNote[] = texts.filter((text) => isTextShown(project, text)).map((text) => {
    const fontSizePx = (text.fontSize ?? project.defaultLine.fontSizePt) * labelScale;
    const fontFamily = text.fontFamily ?? project.defaultLine.fontFamily;
    const bold = getTextLabelBold(text, project);
    const italic = text.labelItalic === true;
    const laid = layoutTextBlock({
      text: getTextDisplayText(text, project),
      left: text.x * width,
      baseline: text.y * height,
      fontSize: fontSizePx,
      width: text.widthPt != null ? text.widthPt * labelScale : undefined,
      minHeight: text.minHeightPt != null ? text.minHeightPt * labelScale : undefined,
      align: text.align ?? "left",
      underline: text.labelUnderline === true,
      yDown: true,
      measure: (sample) =>
        measureViewerText(sample, viewerFontShorthand(fontFamily, fontSizePx, bold, italic)),
    });
    return {
      text,
      frame: laid.frame,
      runs: laid.runs,
      fill: resolveTextColor(text, project),
      fontFamily,
      bold,
      italic,
    };
  });

  const findSegmentAt = (p: NormalizedPoint): { line: LineAnnotation; index: number } | null => {
    const threshold = lineHitTolerancePx / Math.max(width, height);
    for (const line of [...lines].reverse()) {
      for (let index = 0; index < line.points.length - 1; index += 1) {
        const a = line.points[index];
        const b = line.points[index + 1];
        if (a && b && pointToSegmentDistance(p, a, b) < threshold) return { line, index };
      }
    }
    return null;
  };

  const findLineAt = (p: NormalizedPoint): LineAnnotation | null => findSegmentAt(p)?.line ?? null;

  const selectLine = (line: LineAnnotation) => selectMark(line.id);

  const eventPx = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const w = svg.width.baseVal.value || width;
    const h = svg.height.baseVal.value || height;
    return {
      x: ((e.clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((e.clientY - rect.top) / Math.max(rect.height, 1)) * h,
      w,
      h,
      scale: viewerScalePxPerPt(h, useSessionStore.getState().scriptPageHeightPt),
    };
  };

  const capture = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    setActivePage(pageNum);
    const pu = getPointUnclamped(e);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };

    if (activeTool === "shape") {
      shapeGestures.startDraw(pu, e);
      return;
    }
    if (activeTool === "pen") {
      shapeGestures.startPen(pu, e);
      return;
    }
    if (activeTool === "polygon") {
      shapeGestures.polyClick(pu, e);
      return;
    }
    if (activeTool === "image") {
      // Image tool: pick a file, place it centered where the page was clicked, then back to Select.
      const sheet = v2Project.script?.pages[pageNum - 1];
      const at = sheet ? { x: clamp01(pu.x) * sheet.widthPt, y: clamp01(pu.y) * sheet.heightPt } : undefined;
      useSessionStore.getState().setActiveTool("select");
      void pickImageFile().then((file) => file && commands.addImage(file, pageNum, at));
      return;
    }

    if (activeTool === "text") {
      addText({
        id: newId(),
        kind: "text",
        page: pageNum,
        x: p.x,
        y: p.y,
        text: "Note",
        color: v2Project.settings.markDefaults.text.color,
        fontSize: project.defaultLine.fontSizePt,
        fontFamily: project.defaultLine.fontFamily,
        labelBold: project.defaultLine.labelBold,
      });
      return;
    }

    const isDrawTool = activeTool === "line";

    if (activeTool === "select") {
      // The selected shape's handles come first; other shapes sit under lines and notes.
      if (shapeGestures.grabHandle(pu, e)) return;
      const px = eventPx(e);
      const selectedLine = lines.find((line) => line.id === selectedId) ?? null;
      const selectedPx = selectedLine ? selectedLine.points.map((point) => normalizedToPx(point, width, height)) : [];
      const handles = selectedLine
        ? {
            vertices: selectedPx,
            mids: selectedPx.slice(0, -1).map((point, index) => {
              const next = selectedPx[index + 1]!;
              return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
            }),
          }
        : null;
      const asLabel = (label: PlacedLabel) => ({
        which: label.which,
        line: label.line,
        frame: label.frame,
        align: label.align,
        anchor: label.anchor,
      });
      const hitId = (e.target as Element).closest?.("[data-hit-id]")?.getAttribute("data-hit-id") ?? null;
      const target = pickSelectTarget({
        altKey: e.altKey,
        px,
        selectedLine,
        handles,
        selectedNote: placedNotes.find((note) => note.text.id === selectedId) ?? null,
        selectedLabels: placedLabels.filter((label) => label.line.id === selectedId).map(asLabel),
        notesTopFirst: [...placedNotes].reverse(),
        labelsTopFirst: [...placedLabels].reverse().map(asLabel),
        hitId,
        lineForHitId: hitId ? (lines.find((item) => item.id === hitId) ?? null) : null,
        lineAtPoint: findLineAt(p),
      });
      const startPx = { x: px.x, y: px.y };
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const grabsHandle = target.type === "handle" || target.type === "note-resize" || target.type === "label-resize" || target.type === "alt-clone";
      const clickedId = grabsHandle ? null : markIdAt(e);
      // Shift/Ctrl-click adds a mark to the selection, or takes it out.
      if (additive && clickedId) {
        toggleMark(clickedId);
        return;
      }
      // Several selected: dragging any of them moves them all.
      if (!additive && clickedId && selectedIds.length > 1 && selectedSet.has(clickedId)) {
        const origins = v2Project.marks.filter((mark) => selectedSet.has(mark.id));
        breakUndoGroup();
        groupRef.current = { startPx, origins };
        capture(e);
        return;
      }
      if (additive && !grabsHandle) {
        marqueeRef.current = { start: startPx, end: startPx, add: true };
        setMarquee({ start: startPx, end: startPx });
        capture(e);
        return;
      }
      if (target.type === "alt-clone") {
        selectMark(target.line.id);
        setDrag({ type: "alt-clone", lineId: target.line.id, origin: target.line, offset: { x: 0, y: 0 } });
        capture(e);
        return;
      }
      if (target.type === "handle") {
        if (target.handle.kind === "vertex") useSessionStore.getState().clearLineSegment();
        else useSessionStore.getState().setLineSegment(target.line.id, target.handle.index);
        setDrag({ type: "handle", lineId: target.line.id, handle: target.handle, origin: target.line });
        capture(e);
        return;
      }
      if (target.type === "note-resize") {
        e.preventDefault();
        setDrag({ type: "note-resize", handle: target.handle, origin: target.note, startPx, startFrame: target.frame });
        capture(e);
        return;
      }
      if (target.type === "label-move") {
        e.preventDefault();
        selectLine(target.label.line);
        setDrag({
          type: "label-move",
          which: target.label.which,
          origin: target.label.line,
          startPx,
          startFrame: target.label.frame,
          anchor: target.label.anchor,
        });
        capture(e);
        return;
      }
      if (target.type === "label-resize") {
        e.preventDefault();
        setDrag({
          type: "label-resize",
          which: target.label.which,
          handle: target.handle,
          origin: target.label.line,
          startPx,
          startFrame: target.label.frame,
          anchor: target.label.anchor,
        });
        capture(e);
        return;
      }
      if (target.type === "note-move") {
        e.preventDefault();
        selectMark(target.note.id);
        setDrag({ type: "note-move", origin: target.note, startPx, startFrame: target.frame });
        capture(e);
        return;
      }
      if (target.type === "select-line") {
        selectLine(target.line);
        const spot = findSegmentAt(p);
        if (spot && spot.line.id === target.line.id) useSessionStore.getState().setLineSegment(target.line.id, spot.index);
        return;
      }
      if (target.type === "select-id") {
        selectMark(target.id);
        return;
      }
      if (shapeGestures.grabShape(pu, e)) return;
      // Empty page: a drag draws a selection box; a plain click clears the selection.
      marqueeRef.current = { start: startPx, end: startPx, add: false };
      setMarquee({ start: startPx, end: startPx });
      capture(e);
      return;
    }

    if (!isDrawTool) return;

    setDrag({ type: "draw", start: pu });
    setPreviewEnd(pu);
    capture(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (groupRef.current) {
      const px = eventPx(e);
      const g = groupRef.current;
      useProjectStore.getState().apply(edits.translateMarks(g.origins, (px.x - g.startPx.x) * ptPerPx, (px.y - g.startPx.y) * ptPerPx));
      return;
    }
    if (marqueeRef.current) {
      marqueeRef.current.end = eventPx(e);
      setMarquee({ start: marqueeRef.current.start, end: marqueeRef.current.end });
      return;
    }
    if (shapeGestures.move(getPointUnclamped(e), e)) return;
    const current = dragRef.current;
    if (!current) return;
    const pu = getPointUnclamped(e);

    if (current.type === "draw") {
      setPreviewEnd(drawPreviewEnd(current.start, pu, snapDegrees, e.shiftKey));
      return;
    }

    if (current.type === "handle") {
      replaceLine(current.lineId, {
        points: dragLinePoints(current.origin.points, current.handle, pu, snapDegrees, e.shiftKey),
      });
      return;
    }

    if (current.type === "alt-clone") {
      setDrag({ ...current, offset: pu });
      return;
    }

    const px = eventPx(e);
    const dx = px.x - current.startPx.x;
    const dy = px.y - current.startPx.y;
    if (Math.hypot(dx, dy) < 1) return;
    const live = toLegacyProject(useProjectStore.getState().project);

    if (current.type === "note-move") {
      updateText(current.origin.id, noteMovePatch(current.startFrame, dx, dy, px));
      return;
    }

    if (current.type === "note-resize") {
      const note = current.origin;
      const family = note.fontFamily ?? live.defaultLine.fontFamily;
      updateText(
        note.id,
        noteResizePatch(
          note,
          current.startFrame,
          current.handle,
          dx,
          dy,
          px,
          getTextDisplayText(note, live),
          getTextLabelBold(note, live),
          note.labelItalic === true,
          family
        )
      );
      return;
    }

    if (current.type === "label-move" || current.type === "label-resize") {
      const line = current.origin;
      const labels = getLineScriptLabels(line, live);
      const bold = getLineLabelBold(line, live);
      const italic = line.labelItalic === true;
      const family = getLineFontFamily(line, live);
      replaceLine(
        line.id,
        labelDragPatch({
          which: current.which,
          resizing: current.type === "label-resize",
          handle: current.type === "label-resize" ? current.handle : null,
          startFrame: current.startFrame,
          anchor: current.anchor,
          dx,
          dy,
          sampleText: current.which === "primary" ? labels.primary : labels.secondary ?? "",
          align: current.which === "primary" ? line.labelAlign ?? "left" : line.secondaryAlign ?? "left",
          scale: px.scale,
          measure: (sample) =>
            measureViewerText(sample, viewerFontShorthand(family, current.startFrame.fontSize, bold, italic)),
        })
      );
    }
  };

  /** The mark under the pointer, the way a click would pick it: notes, captions, lines, then shapes. */
  const markIdAt = (e: { clientX: number; clientY: number; target: EventTarget | null }): string | null => {
    const pu = getPointUnclamped(e as React.PointerEvent);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };
    const px = eventPx(e);
    const note = [...placedNotes].reverse().find((n) => pointInFrame(px.x, px.y, n.frame));
    if (note) return note.text.id;
    const label = [...placedLabels].reverse().find((l) => pointInFrame(px.x, px.y, l.frame));
    if (label) return label.line.id;
    const hitId = (e.target as Element | null)?.closest?.("[data-hit-id]")?.getAttribute("data-hit-id");
    if (hitId) return hitId;
    return findSegmentAt(p)?.line.id ?? shapeGestures.shapeAt(pu)?.id ?? null;
  };

  /** Marks touching a box (page pixels): lines, captions, notes and shapes. */
  const marksInBox = (a: { x: number; y: number }, b: { x: number; y: number }): string[] => {
    const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
    const touches = (l: number, t: number, r: number, bt: number) => l <= box.right && r >= box.left && t <= box.bottom && bt >= box.top;
    const ids: string[] = [];
    for (const line of lines) {
      const pts = line.points.map((point) => normalizedToPx(point, width, height));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      if (touches(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) ids.push(line.id);
    }
    for (const label of placedLabels) {
      const f = label.frame;
      if (touches(f.left, f.top, f.left + f.width, f.top + f.height)) ids.push(label.line.id);
    }
    for (const note of placedNotes) {
      const f = note.frame;
      if (touches(f.left, f.top, f.left + f.width, f.top + f.height)) ids.push(note.text.id);
    }
    ids.push(...shapeGestures.shapesInBox({ x: box.left * ptPerPx, y: box.top * ptPerPx }, { x: box.right * ptPerPx, y: box.bottom * ptPerPx }));
    return [...new Set(ids)];
  };

  /** Right-click: picks the mark under the pointer the way a click would, then offers its actions. */
  const handleContextMenu = (e: React.MouseEvent) => {
    setActivePage(pageNum);
    const pu = getPointUnclamped(e);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };
    const px = eventPx(e);
    const hitId = (e.target as Element).closest?.("[data-hit-id]")?.getAttribute("data-hit-id") ?? null;
    const note = [...placedNotes].reverse().find((n) => pointInFrame(px.x, px.y, n.frame));
    const label = [...placedLabels].reverse().find((l) => pointInFrame(px.x, px.y, l.frame));
    const segment = findSegmentAt(p);
    const id = note?.text.id ?? label?.line.id ?? hitId ?? segment?.line.id ?? shapeGestures.shapeAt(pu)?.id ?? null;
    const hasClip = !!useSessionStore.getState().clipboard?.length;
    const pasteItems: ContextMenuItem[] = [
      { label: "Paste", shortcut: "Ctrl+V", disabled: !hasClip, onSelect: () => commands.paste(pageNum) },
      { label: "Paste in place", shortcut: "Ctrl+Shift+V", disabled: !hasClip, onSelect: () => commands.paste(pageNum, true) },
    ];
    if (!id) {
      useSessionStore.getState().clearSelection();
      openContextMenu(e, pasteItems);
      return;
    }
    selectMark(id);
    const mark = edits.findMark(v2Project, id);
    const shotId = mark ? edits.markShotId(mark) : undefined;
    const found = edits.findShot(v2Project, shotId);
    const linkedShot = found
      ? {
          id: found.shot.id,
          label: shotIdLabel(found.sceneIndex, found.shotIndex, v2Project.settings.general.shotIdStyle),
          sceneNumber: found.sceneIndex + 1,
        }
      : null;
    const isLine = mark?.kind === "line";
    if (isLine && segment?.line.id === id && mark.points.length > 2) useSessionStore.getState().setLineSegment(id, segment.index);
    openContextMenu(e, [
      { label: "Cut", shortcut: "Ctrl+X", onSelect: commands.cut },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: commands.copy },
      ...pasteItems,
      { label: "Duplicate", shortcut: "Ctrl+D", onSelect: commands.duplicateSelection },
      ...(isLine
        ? [
            "separator" as const,
            { label: "Split here", onSelect: () => commands.splitSelection(segment?.line.id === id ? segment.index : undefined, segment?.line.id === id ? p : undefined) },
            { label: "Rejoin", disabled: mark.points.length < 3, onSelect: commands.rejoinSelection },
          ]
        : []),
      ...(linkedShot
        ? [
            "separator" as const,
            { label: `Select shot ${linkedShot.label}`, onSelect: () => useSessionStore.getState().select("shot", linkedShot.id) },
            // The same as the shot's eye in the Scenes list: all its lines, notes and shapes hide.
            { label: `Hide shot ${linkedShot.label}`, shortcut: "Ctrl+H", onSelect: commands.hideSelectedShot },
            { label: `Hide scene ${linkedShot.sceneNumber}`, shortcut: "Ctrl+Shift+H", onSelect: commands.hideSelectedScene },
          ]
        : []),
      "separator",
      { label: "Show everything hidden", shortcut: "Alt+H", onSelect: commands.showAllHidden },
      { label: "Delete", shortcut: "Del", danger: true, onSelect: commands.deleteSelection },
    ]);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Polygon: a double-click finishes the shape, left open.
    if (activeTool === "polygon") {
      shapeGestures.finishPoly(false);
      return;
    }
    const px = eventPx(e);
    if (placedNotes.some((note) => pointInFrame(px.x, px.y, note.frame))) {
      useSessionStore.getState().setActiveTool("select");
      return;
    }
    if (placedLabels.some((label) => pointInFrame(px.x, px.y, label.frame))) {
      useSessionStore.getState().setActiveTool("select");
      return;
    }
    const pu = getPointUnclamped(e);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };
    const hit = findLineAt(p);
    if (hit && hit.id === selectedId) {
      const spot = closestOnLine(hit.points, p);
      if (spot) commands.splitSelection(spot.index, spot.point);
      return;
    }
    if (hit) useSessionStore.getState().setActiveTool("select");
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (groupRef.current) {
      groupRef.current = null;
      breakUndoGroup();
      return;
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      const tiny = Math.abs(m.end.x - m.start.x) < 3 && Math.abs(m.end.y - m.start.y) < 3;
      if (tiny) {
        if (!m.add) useSessionStore.getState().clearSelection();
        return;
      }
      const found = marksInBox(m.start, m.end);
      const before = m.add && useSessionStore.getState().selection?.kind === "mark" ? useSessionStore.getState().selection!.ids : [];
      useSessionStore.getState().selectMarks([...before, ...found]);
      return;
    }
    if (shapeGestures.up(getPointUnclamped(e), e)) return;
    const current = dragRef.current;
    if (!current) return;

    let trimLineId: string | null = null;
    let trimHint: MarginTrimHint = "drawEnd";

    if (current.type === "draw") {
      const pu = getPointUnclamped(e);
      const end = finishDrawEnd(current.start, pu, snapDegrees, e.shiftKey);

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+drag: a new shot for this line, in one undo step.
        const shotId = commands.newShotForLine();
        const line = createLineFromShot(pageNum, [current.start, end], toLegacyProject(useProjectStore.getState().project), shotId);
        addLineJoined(line);
        trimLineId = line.id;
      } else {
        const line = createLineFromShot(pageNum, [current.start, end], project, linkedShotId);
        addLine(line, true);
        trimLineId = line.id;
      }
      trimHint = "drawEnd";
    }

    if (current.type === "alt-clone") {
      const pu = getPointUnclamped(e);
      const dup = cloneLine(current.origin, pageNum);
      dup.points = clonedLinePoints(current.origin.points, pu);
      addLine(dup);
      trimLineId = dup.id;
      trimHint = "center";
    }

    if (current.type === "handle") {
      trimLineId = current.lineId;
      trimHint =
        current.handle.kind === "vertex"
          ? current.handle.index === 0
            ? "start"
            : current.handle.index === current.origin.points.length - 1
              ? "end"
              : "center"
          : "center";
    }

    if (trimLineId) {
      applyMarginContinuationTrim(trimLineId, pageHeightPt, trimHint);
    }

    setDrag(null);
    setPreviewEnd(null);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const barLine = lines.find((line) => line.id === selectedId);
  const barNote = placedNotes.find((note) => note.text.id === selectedId);
  const barBounds = barLine
    ? (() => {
        const px = barLine.points.map((point) => normalizedToPx(point, width, height));
        return {
          left: Math.min(...px.map((point) => point.x)),
          top: Math.min(...px.map((point) => point.y)),
          right: Math.max(...px.map((point) => point.x)),
          bottom: Math.max(...px.map((point) => point.y)),
        };
      })()
    : barNote
      ? {
          left: barNote.frame.left,
          top: barNote.frame.top,
          right: barNote.frame.left + barNote.frame.width,
          bottom: barNote.frame.top + barNote.frame.height,
        }
      : null;
  const barPos = barBounds && showActionBar ? actionBarPosition(barBounds, width, height) : null;

  return (
    <>
    {shapeGestures.highlightLayer}
    <svg
      ref={svgRef}
      className={`annotation-layer ${cursorClass}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onDragStart={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      // A JPG or PNG dropped on the page is placed where it lands.
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = [...e.dataTransfer.files].find((f) => f.type === "image/png" || f.type === "image/jpeg");
        if (!file) return;
        e.preventDefault();
        const pu = getPointUnclamped(e);
        const sheet = v2Project.script?.pages[pageNum - 1];
        void commands.addImage(file, pageNum, sheet ? { x: clamp01(pu.x) * sheet.widthPt, y: clamp01(pu.y) * sheet.heightPt } : undefined);
      }}
    >
      {shapeGestures.shapesLayer}
      {lines.map((line) => {
        const style = resolveLineStyle(line, project);
        const pts = line.points.map((point) => normalizedToPx(point, width, height));
        const last = pts.length - 1;
        if (last < 1) return null;
        const isSel = selectedSet.has(line.id);
        const strokePx = style.widthPt * labelScale;
        const startInset = (endingGeometry(style.start, style.widthPt)?.shaftInsetPt ?? 0) * labelScale;
        const endInset = (endingGeometry(style.end, style.widthPt)?.shaftInsetPt ?? 0) * labelScale;
        const startAng = lineAngleRad(pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y);
        const endAng = lineAngleRad(pts[last - 1]!.x, pts[last - 1]!.y, pts[last]!.x, pts[last]!.y);
        const source = v2Project.marks.find((mark) => mark.id === line.id);
        const owned = source?.kind === "line" ? source : undefined;
        // Outline: a halo under the whole line (every segment, strand and ending), drawn before the line itself.
        const halo = owned?.outline && owned.outline.widthPt > 0 ? owned.outline : null;
        const haloStrokePx = halo ? strokePx + halo.widthPt * 2.5 * labelScale : 0;
        const capsFor = (color: string, width: number) => {
          const startCap = renderLineCap(style.start, color, width, startAng, true, labelScale);
          const endCap = renderLineCap(style.end, color, width, endAng, false, labelScale);
          // Mid markers sit on each split point, pointing along the segment that arrives there.
          const midEnding = owned?.mid ? legacyEnding(owned.mid) : null;
          return (
            <>
              {startCap && <g transform={`translate(${pts[0]!.x}, ${pts[0]!.y})`}>{startCap.elements}</g>}
              {endCap && <g transform={`translate(${pts[last]!.x}, ${pts[last]!.y})`}>{endCap.elements}</g>}
              {midEnding &&
                pts.slice(1, -1).map((point, index) => {
                  const before = pts[index]!;
                  const cap = renderLineCap(midEnding, color, width, lineAngleRad(before.x, before.y, point.x, point.y), false, labelScale);
                  return cap && <g key={`mid-${index}`} transform={`translate(${point.x}, ${point.y})`}>{cap.elements}</g>;
                })}
            </>
          );
        };
        const segments = pts.slice(0, -1).map((start, index) => {
          const end = pts[index + 1]!;
          const look = owned
            ? segmentLook(owned, index)
            : { pattern: style.stroke === "solid" ? "straight" : style.stroke, widthPt: style.widthPt };
          const [shaftStart, shaftEnd] = shaftEnds(start, end, index === 0 ? startInset : 0, index === last - 1 ? endInset : 0);
          const strands = segmentStrands(
            { x: shaftStart.x / labelScale, y: shaftStart.y / labelScale },
            { x: shaftEnd.x / labelScale, y: shaftEnd.y / labelScale },
            look.pattern,
            look.widthPt,
            look
          );
          return { index, look, shaftStart, shaftEnd, strands };
        });
        const strandLines = (color: string, extraPt: number, key: string) =>
          segments.flatMap(({ index, strands }) =>
            strands.map((strand, strandIndex) => (
              <polyline
                key={`${key}-${index}-${strandIndex}`}
                points={strand.points.map((point) => `${point.x * labelScale},${point.y * labelScale}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={(strand.widthPt + extraPt) * labelScale}
                strokeDasharray={strand.dash?.map((part) => part * labelScale).join(" ")}
                strokeOpacity={strand.opacity}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          );

        return (
          <g key={line.id} className={isSel ? "line-selected" : undefined}>
            {segments.map(({ index, look, shaftStart, shaftEnd }) =>
              last > 1 && lineSegment?.lineId === line.id && lineSegment.index === index ? (
                <line
                  key={`sel-${index}`}
                  x1={shaftStart.x}
                  y1={shaftStart.y}
                  x2={shaftEnd.x}
                  y2={shaftEnd.y}
                  stroke="#4a9eff"
                  strokeWidth={look.widthPt * labelScale + 6}
                  strokeOpacity={0.45}
                  strokeLinecap="round"
                />
              ) : null
            )}
            {halo && (
              <g className="line-halo">
                {strandLines(halo.color, halo.widthPt * 2, "halo")}
                {capsFor(halo.color, haloStrokePx)}
              </g>
            )}
            {strandLines(style.color, 0, "stroke")}
            {capsFor(style.color, strokePx)}
          </g>
        );
      })}
      {placedLabels.map((label) => (
        <ScriptTextBlock
          key={`${label.line.id}-${label.which}`}
          frame={label.frame}
          runs={label.runs}
          fill={label.fill}
          fontFamily={label.fontFamily}
          bold={label.bold}
          italic={label.italic}
          selected={selectedSet.has(label.line.id)}
          hitId={label.line.id}
          align={label.align}
          anchor={label.anchor}
          halo={textHalo(captionOutlineOf(label.line.id))}
        />
      ))}
      {lines.map((line) => {
        if (line.id !== selectedId) return null;
        const pts = line.points.map((point) => normalizedToPx(point, width, height));
        return (
          <g key={`${line.id}-handles`}>
            {pts.map((point, index) => (
              <circle key={`v${index}`} className="line-handle" cx={point.x} cy={point.y} r={6} />
            ))}
            {pts.slice(0, -1).map((point, index) => {
              const next = pts[index + 1]!;
              return (
                <circle
                  key={`m${index}`}
                  className="line-handle line-handle-center"
                  cx={(point.x + next.x) / 2}
                  cy={(point.y + next.y) / 2}
                  r={6}
                />
              );
            })}
          </g>
        );
      })}
      {placedNotes.map((note) => (
        <ScriptTextBlock
          key={note.text.id}
          frame={note.frame}
          runs={note.runs}
          fill={note.fill}
          fontFamily={note.fontFamily}
          bold={note.bold}
          italic={note.italic}
          selected={selectedSet.has(note.text.id)}
          hitId={note.text.id}
          halo={textHalo(noteOutlineOf(note.text.id))}
        />
      ))}
      {drag?.type === "draw" && previewEnd && (
        <line
          x1={normalizedToPx(drag.start, width, height).x}
          y1={normalizedToPx(drag.start, width, height).y}
          x2={normalizedToPx(previewEnd, width, height).x}
          y2={normalizedToPx(previewEnd, width, height).y}
          stroke="#4a9eff"
          strokeWidth={2 * labelScale}
          strokeDasharray={`${4 * labelScale} ${4 * labelScale}`}
          pointerEvents="none"
        />
      )}
      {shapeGestures.handlesLayer}
      {marquee && (
        <rect
          className="select-box"
          x={Math.min(marquee.start.x, marquee.end.x)}
          y={Math.min(marquee.start.y, marquee.end.y)}
          width={Math.abs(marquee.end.x - marquee.start.x)}
          height={Math.abs(marquee.end.y - marquee.start.y)}
          pointerEvents="none"
        />
      )}
    </svg>
    {barPos && selectedId && (
      <ScriptActionBar
        markId={selectedId}
        shotId={barLine?.shotId ?? barNote?.text.shotId}
        isLine={Boolean(barLine)}
        anchorLeft={barPos.left}
        anchorTop={barPos.top}
        pageWidth={width}
        pageHeight={height}
      />
    )}
    </>
  );
}

function pointToSegmentDistance(
  p: NormalizedPoint,
  a: NormalizedPoint,
  b: NormalizedPoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}
