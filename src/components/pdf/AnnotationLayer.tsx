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
  textIsVisible,
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
import { addLine, addText, applyMarginContinuationTrim, replaceLine, selectMark, updateText } from "../../drawing/marks";
import { useProjectStore } from "../../stores/projectStore";
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

export function AnnotationLayer({ pageNum, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const v2Project = useProjectStore((s) => s.project);
  const project = useMemo(() => toLegacyProject(v2Project), [v2Project]);
  const activeTool = useSessionStore((s) => s.activeTool);
  const selectedId = useSessionStore((s) => (s.selection?.kind === "mark" ? s.selection.ids[0] : undefined));
  const cursorClass =
    activeTool === "line"
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

  const placedNotes: PlacedNote[] = texts.filter(textIsVisible).map((text) => {
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

    if (activeTool === "text") {
      addText({
        id: newId(),
        kind: "text",
        page: pageNum,
        x: p.x,
        y: p.y,
        text: "Note",
        color: "#111111",
        fontSize: project.defaultLine.fontSizePt,
        fontFamily: project.defaultLine.fontFamily,
        labelBold: project.defaultLine.labelBold,
      });
      return;
    }

    const isDrawTool = activeTool === "line";

    if (activeTool === "select") {
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
      useSessionStore.getState().clearSelection();
      return;
    }

    if (!isDrawTool) return;

    setDrag({ type: "draw", start: pu });
    setPreviewEnd(pu);
    capture(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
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

  const handleDoubleClick = (e: React.MouseEvent) => {
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
    const current = dragRef.current;
    if (!current) return;

    let trimLineId: string | null = null;
    let trimHint: MarginTrimHint = "drawEnd";

    if (current.type === "draw") {
      const pu = getPointUnclamped(e);
      const end = finishDrawEnd(current.start, pu, snapDegrees, e.shiftKey);

      const line = createLineFromShot(pageNum, [current.start, end], project, linkedShotId);
      addLine(line);
      trimLineId = line.id;
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
    >
      {lines.map((line) => {
        const style = resolveLineStyle(line, project);
        const pts = line.points.map((point) => normalizedToPx(point, width, height));
        const last = pts.length - 1;
        if (last < 1) return null;
        const isSel = line.id === selectedId;
        const strokePx = style.widthPt * labelScale;
        const startInset = (endingGeometry(style.start, style.widthPt)?.shaftInsetPt ?? 0) * labelScale;
        const endInset = (endingGeometry(style.end, style.widthPt)?.shaftInsetPt ?? 0) * labelScale;
        const startAng = lineAngleRad(pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y);
        const endAng = lineAngleRad(pts[last - 1]!.x, pts[last - 1]!.y, pts[last]!.x, pts[last]!.y);
        const startCap = renderLineCap(style.start, style.color, strokePx, startAng, true, labelScale);
        const endCap = renderLineCap(style.end, style.color, strokePx, endAng, false, labelScale);
        // Mid markers sit on each split point, pointing along the segment that arrives there.
        const midSource = v2Project.marks.find((mark) => mark.id === line.id);
        const midEnding = midSource?.kind === "line" && midSource.mid ? legacyEnding(midSource.mid) : null;
        const midCaps = midEnding
          ? pts.slice(1, -1).map((point, index) => {
              const before = pts[index]!;
              const cap = renderLineCap(midEnding, style.color, strokePx, lineAngleRad(before.x, before.y, point.x, point.y), false, labelScale);
              return cap && <g key={`mid-${index}`} transform={`translate(${point.x}, ${point.y})`}>{cap.elements}</g>;
            })
          : null;

        return (
          <g key={line.id} className={isSel ? "line-selected" : undefined}>
            {pts.slice(0, -1).map((start, index) => {
              const end = pts[index + 1]!;
              const source = v2Project.marks.find((mark) => mark.id === line.id);
              const owned = source?.kind === "line" ? source : undefined;
              const look = owned
                ? segmentLook(owned, index)
                : { pattern: style.stroke === "solid" ? "straight" : style.stroke, widthPt: style.widthPt };
              const [shaftStart, shaftEnd] = shaftEnds(
                start,
                end,
                index === 0 ? startInset : 0,
                index === last - 1 ? endInset : 0
              );
              const strands = segmentStrands(
                { x: shaftStart.x / labelScale, y: shaftStart.y / labelScale },
                { x: shaftEnd.x / labelScale, y: shaftEnd.y / labelScale },
                look.pattern,
                look.widthPt,
                look
              );
              const segmentOn = last > 1 && lineSegment?.lineId === line.id && lineSegment.index === index;
              return (
                <g key={index}>
                  {segmentOn && (
                    <line
                      x1={shaftStart.x}
                      y1={shaftStart.y}
                      x2={shaftEnd.x}
                      y2={shaftEnd.y}
                      stroke="#4a9eff"
                      strokeWidth={look.widthPt * labelScale + 6}
                      strokeOpacity={0.45}
                      strokeLinecap="round"
                    />
                  )}
                  {strands.map((strand, strandIndex) => (
                    <polyline
                      key={strandIndex}
                      points={strand.points.map((point) => `${point.x * labelScale},${point.y * labelScale}`).join(" ")}
                      fill="none"
                      stroke={style.color}
                      strokeWidth={strand.widthPt * labelScale}
                      strokeDasharray={strand.dash?.map((part) => part * labelScale).join(" ")}
                      strokeOpacity={strand.opacity}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              );
            })}
            {startCap && <g transform={`translate(${pts[0]!.x}, ${pts[0]!.y})`}>{startCap.elements}</g>}
            {endCap && <g transform={`translate(${pts[last]!.x}, ${pts[last]!.y})`}>{endCap.elements}</g>}
            {midCaps}
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
          selected={label.line.id === selectedId}
          hitId={label.line.id}
          align={label.align}
          anchor={label.anchor}
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
          selected={note.text.id === selectedId}
          hitId={note.text.id}
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
