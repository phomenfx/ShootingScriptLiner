import { useCallback, useRef, useState } from "react";
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
  MIN_DRAG_NORMALIZED,
  normalizedToPx,
  offsetPointUnclamped,
  snapEndpoint,
} from "../../lib/coords";
import { newId } from "../../lib/ids";
import { useProjectStore } from "../../stores/projectStore";
import type { LineAnnotation, NormalizedPoint, TextAlign, TextAnnotation } from "../../types/annotations";
import {
  midpoint,
  primaryLabelAnchor,
  primaryLabelPositionPx,
  primaryLayoutForLine,
  secondaryLabelAnchor,
  secondaryLabelPositionPx,
  secondaryLayoutForLine,
  viewerScalePxPerPt,
} from "../../lib/labelLayout";
import { lineAngleRad, renderLineCap } from "../../lib/lineCaps";
import { strokeDashArray } from "../../lib/lineStrokes";
import { ScriptTextBlock } from "./ScriptTextBlock";
import {
  ASCENT_EM,
  alignmentPoint,
  clampBoxHeightPt,
  clampBoxWidthPt,
  hitBoxHandle,
  layoutTextBlock,
  measureViewerText,
  pinBlockToOrigin,
  pointInFrame,
  primaryOffsetFromPlacement,
  resizeTextBox,
  secondaryOffsetFromPlacement,
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
  | { type: "handle"; lineId: string; handle: "start" | "end" | "center"; origin: LineAnnotation }
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

function hitHandle(
  px: number,
  py: number,
  hx: number,
  hy: number,
  radius = 10
): boolean {
  return (px - hx) ** 2 + (py - hy) ** 2 <= radius * radius;
}

function hitOriginPoint(px: number, py: number, frame: TextFrame, align: TextAlign) {
  const point = alignmentPoint(frame, align, true);
  return (px - point.x) ** 2 + (py - point.y) ** 2 <= 64;
}

export function AnnotationLayer({ pageNum, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const activeTool = useProjectStore((s) => s.activeTool);
  const cursorClass =
    activeTool === "line"
      ? "tool-draw"
      : activeTool === "text"
        ? "tool-text"
        : "tool-select";
  const pageHeightPt = useProjectStore((s) => s.scriptPageHeightPt);
  const snapAngleDegrees = useProjectStore((s) => s.project.snapAngleDegrees);
  const addLine = useProjectStore((s) => s.addLine);
  const addText = useProjectStore((s) => s.addText);
  const updateLine = useProjectStore((s) => s.updateLine);
  const updateText = useProjectStore((s) => s.updateText);
  const applyMarginContinuationTrim = useProjectStore((s) => s.applyMarginContinuationTrim);
  const lineHitTolerancePx = useProjectStore((s) => s.lineHitTolerancePx);
  const selectAnnotation = useProjectStore((s) => s.selectAnnotation);
  const setSceneCollapsed = useProjectStore((s) => s.setSceneCollapsed);
  const setActivePage = useProjectStore((s) => s.setActivePage);
  const shotSelection = useProjectStore((s) =>
    s.selection?.kind === "shot" ? s.selection : null
  );

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
  const selectedId = selection?.kind === "annotation" ? selection.annotationId : null;

  const placedLabels: PlacedLabel[] = lines.flatMap((line) => {
    const labels = getLineScriptLabels(line, project);
    const p0 = normalizedToPx(line.points[0], width, height);
    const p1 = normalizedToPx(line.points[1], width, height);
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

  const findLineAt = (p: NormalizedPoint): LineAnnotation | null => {
    const threshold = lineHitTolerancePx / Math.max(width, height);
    for (const line of [...lines].reverse()) {
      const a = line.points[0];
      const b = line.points[1];
      const dist = pointToSegmentDistance(p, a, b);
      if (dist < threshold) return line;
    }
    return null;
  };

  const selectLine = (line: LineAnnotation) => {
    selectAnnotation(line.id);
    if (!line.shotId) return;
    const scene = project.scenes.find((sc) => sc.shots.some((sh) => sh.id === line.shotId));
    if (scene) setSceneCollapsed(scene.id, false);
  };

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
      scale: viewerScalePxPerPt(h, useProjectStore.getState().scriptPageHeightPt),
    };
  };

  const capture = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
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
      const hitEarly = findLineAt(p);
      if (e.altKey && hitEarly) {
        selectAnnotation(hitEarly.id);
        setDrag({
          type: "alt-clone",
          lineId: hitEarly.id,
          origin: hitEarly,
          offset: { x: 0, y: 0 },
        });
        capture(e);
        return;
      }

      const px = eventPx(e);
      const selectedLine = lines.find((line) => line.id === selectedId);
      if (selectedLine) {
        const p0 = normalizedToPx(selectedLine.points[0], width, height);
        const p1 = normalizedToPx(selectedLine.points[1], width, height);
        const mid = midpoint(p0, p1);
        const handle = hitHandle(px.x, px.y, p0.x, p0.y)
          ? "start"
          : hitHandle(px.x, px.y, p1.x, p1.y)
            ? "end"
            : hitHandle(px.x, px.y, mid.x, mid.y, 6)
              ? "center"
              : null;
        if (handle) {
          setDrag({ type: "handle", lineId: selectedLine.id, handle, origin: selectedLine });
          capture(e);
          return;
        }
      }

      const selectedNote = placedNotes.find((note) => note.text.id === selectedId);
      if (selectedNote) {
        const handle = hitBoxHandle(px.x, px.y, selectedNote.frame);
        if (handle) {
          e.preventDefault();
          setDrag({
            type: "note-resize",
            handle,
            origin: selectedNote.text,
            startPx: { x: px.x, y: px.y },
            startFrame: selectedNote.frame,
          });
          capture(e);
          return;
        }
      }

      const selectedLabels = placedLabels.filter((label) => label.line.id === selectedId);
      for (const label of selectedLabels) {
        if (hitOriginPoint(px.x, px.y, label.frame, label.align)) {
          e.preventDefault();
          setDrag({
            type: "label-move",
            which: label.which,
            origin: label.line,
            startPx: { x: px.x, y: px.y },
            startFrame: label.frame,
            anchor: label.anchor,
          });
          capture(e);
          return;
        }
        const handle = hitBoxHandle(px.x, px.y, label.frame);
        if (handle) {
          e.preventDefault();
          setDrag({
            type: "label-resize",
            which: label.which,
            handle,
            origin: label.line,
            startPx: { x: px.x, y: px.y },
            startFrame: label.frame,
            anchor: label.anchor,
          });
          capture(e);
          return;
        }
      }

      for (const note of [...placedNotes].reverse()) {
        if (!pointInFrame(px.x, px.y, note.frame)) continue;
        e.preventDefault();
        selectAnnotation(note.text.id);
        setDrag({
          type: "note-move",
          origin: note.text,
          startPx: { x: px.x, y: px.y },
          startFrame: note.frame,
        });
        capture(e);
        return;
      }

      for (const label of [...placedLabels].reverse()) {
        if (!pointInFrame(px.x, px.y, label.frame)) continue;
        e.preventDefault();
        selectLine(label.line);
        setDrag({
          type: "label-move",
          which: label.which,
          origin: label.line,
          startPx: { x: px.x, y: px.y },
          startFrame: label.frame,
          anchor: label.anchor,
        });
        capture(e);
        return;
      }

      const hit = findLineAt(p);
      if (hit) {
        selectLine(hit);
        return;
      }
      useProjectStore.getState().clearSelection();
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
      const end = snapEndpoint(current.start, pu, snapAngleDegrees, e.shiftKey);
      setPreviewEnd(end);
      return;
    }

    if (current.type === "handle") {
      const { origin, handle } = current;
      const [a, b] = origin.points;
      if (handle === "start") {
        const start = snapEndpoint(b, pu, snapAngleDegrees, e.shiftKey);
        updateLine(current.lineId, { points: [start, b] });
      } else if (handle === "end") {
        const end = snapEndpoint(a, pu, snapAngleDegrees, e.shiftKey);
        updateLine(current.lineId, { points: [a, end] });
      } else {
        const dx = pu.x - (a.x + b.x) / 2;
        const dy = pu.y - (a.y + b.y) / 2;
        updateLine(current.lineId, {
          points: [offsetPointUnclamped(a, dx, dy), offsetPointUnclamped(b, dx, dy)],
        });
      }
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
    const live = useProjectStore.getState().project;

    if (current.type === "note-move") {
      const left = current.startFrame.left + dx;
      const baseline = current.startFrame.top + dy + current.startFrame.fontSize * ASCENT_EM;
      updateText(current.origin.id, { x: left / px.w, y: baseline / px.h });
      return;
    }

    if (current.type === "note-resize") {
      const note = current.origin;
      const bold = getTextLabelBold(note, live);
      const italic = note.labelItalic === true;
      const family = note.fontFamily ?? live.defaultLine.fontFamily;
      const resized = resizeTextBox(
        current.startFrame,
        current.handle,
        dx,
        dy,
        getTextDisplayText(note, live),
        note.align ?? "left",
        (sample) =>
          measureViewerText(
            sample,
            viewerFontShorthand(family, current.startFrame.fontSize, bold, italic)
          )
      );
      const baseline = resized.top + current.startFrame.fontSize * ASCENT_EM;
      updateText(note.id, {
        x: resized.left / px.w,
        y: baseline / px.h,
        ...(resized.widthChanged ? { widthPt: clampBoxWidthPt(resized.width / px.scale) } : {}),
        ...(resized.heightChanged
          ? {
              minHeightPt:
                resized.minHeight != null ? clampBoxHeightPt(resized.minHeight / px.scale) : undefined,
            }
          : {}),
      });
      return;
    }

    if (current.type === "label-move" || current.type === "label-resize") {
      const line = current.origin;
      const labels = getLineScriptLabels(line, live);
      const sampleText = current.which === "primary" ? labels.primary : labels.secondary ?? "";
      const align: TextAlign =
        current.which === "primary" ? line.labelAlign ?? "left" : line.secondaryAlign ?? "left";
      const bold = getLineLabelBold(line, live);
      const italic = line.labelItalic === true;
      const family = getLineFontFamily(line, live);
      const moved =
        current.type === "label-resize"
          ? resizeTextBox(
              current.startFrame,
              current.handle,
              dx,
              dy,
              sampleText,
              align,
              (sample) =>
                measureViewerText(
                  sample,
                  viewerFontShorthand(family, current.startFrame.fontSize, bold, italic)
                )
            )
          : {
              left: current.startFrame.left + dx,
              top: current.startFrame.top + dy,
              width: current.startFrame.width,
              height: current.startFrame.height,
              minHeight: undefined as number | undefined,
              widthChanged: false,
              heightChanged: false,
            };
      const placedFrame: TextFrame = {
        ...current.startFrame,
        left: moved.left,
        top: moved.top,
        width: moved.width,
        height: moved.height,
      };
      if (current.which === "primary") {
        updateLine(line.id, {
          ...primaryOffsetFromPlacement(current.anchor, placedFrame, align, px.scale),
          ...(moved.widthChanged ? { labelWidthPt: clampBoxWidthPt(moved.width / px.scale) } : {}),
          ...(moved.heightChanged
            ? {
                labelMinHeightPt:
                  moved.minHeight != null ? clampBoxHeightPt(moved.minHeight / px.scale) : undefined,
              }
            : {}),
        });
      } else {
        updateLine(line.id, {
          ...secondaryOffsetFromPlacement(
            current.anchor,
            placedFrame,
            align,
            current.startFrame.fontSize,
            px.scale
          ),
          ...(moved.widthChanged
            ? { secondaryWidthPt: clampBoxWidthPt(moved.width / px.scale) }
            : {}),
          ...(moved.heightChanged
            ? {
                secondaryMinHeightPt:
                  moved.minHeight != null ? clampBoxHeightPt(moved.minHeight / px.scale) : undefined,
              }
            : {}),
        });
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const px = eventPx(e);
    if (placedNotes.some((note) => pointInFrame(px.x, px.y, note.frame))) {
      useProjectStore.getState().setActiveTool("select");
      return;
    }
    if (placedLabels.some((label) => pointInFrame(px.x, px.y, label.frame))) {
      useProjectStore.getState().setActiveTool("select");
      return;
    }
    const pu = getPointUnclamped(e);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };
    if (findLineAt(p)) useProjectStore.getState().setActiveTool("select");
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current) return;

    let trimLineId: string | null = null;
    let trimHint: MarginTrimHint = "drawEnd";

    if (current.type === "draw") {
      const pu = getPointUnclamped(e);
      let end = snapEndpoint(current.start, pu, snapAngleDegrees, e.shiftKey);
      if (distance(current.start, end) < MIN_DRAG_NORMALIZED) {
        end = { x: current.start.x, y: current.start.y + MIN_DRAG_NORMALIZED };
      }

      const shotId = shotSelection?.shotId;
      const line = createLineFromShot(pageNum, [current.start, end], project, shotId);
      addLine(line);
      trimLineId = line.id;
      trimHint = "drawEnd";
    }

    if (current.type === "alt-clone") {
      const pu = getPointUnclamped(e);
      const start = current.origin.points[0];
      const dx = pu.x - start.x;
      const dy = pu.y - start.y;
      const dup = cloneLine(current.origin, pageNum);
      dup.points = [
        offsetPointUnclamped(current.origin.points[0], dx, dy),
        offsetPointUnclamped(current.origin.points[1], dx, dy),
      ];
      addLine(dup);
      trimLineId = dup.id;
      trimHint = "center";
    }

    if (current.type === "handle") {
      trimLineId = current.lineId;
      trimHint =
        current.handle === "start" ? "start" : current.handle === "end" ? "end" : "center";
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

  return (
    <svg
      ref={svgRef}
      className={`annotation-layer ${cursorClass}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {lines.map((line) => {
        const style = resolveLineStyle(line, project);
        const p0 = normalizedToPx(line.points[0], width, height);
        const p1 = normalizedToPx(line.points[1], width, height);
        const isSel = line.id === selectedId;
        const ang = lineAngleRad(p0.x, p0.y, p1.x, p1.y);
        const strokePx = style.widthPt * labelScale;
        const startCap = renderLineCap(style.start, style.color, strokePx, ang, true, labelScale);
        const endCap = renderLineCap(style.end, style.color, strokePx, ang, false, labelScale);

        return (
          <g key={line.id} className={isSel ? "line-selected" : undefined}>
            <line
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke={style.color}
              strokeWidth={strokePx}
              strokeDasharray={strokeDashArray(style.stroke, strokePx)}
            />
            {startCap && <g transform={`translate(${p0.x}, ${p0.y})`}>{startCap.elements}</g>}
            {endCap && <g transform={`translate(${p1.x}, ${p1.y})`}>{endCap.elements}</g>}
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
          align={label.align}
          anchor={label.anchor}
        />
      ))}
      {lines.map((line) => {
        if (line.id !== selectedId) return null;
        const p0 = normalizedToPx(line.points[0], width, height);
        const p1 = normalizedToPx(line.points[1], width, height);
        const mid = midpoint(p0, p1);
        return (
          <g key={`${line.id}-handles`}>
            <circle className="line-handle" cx={p0.x} cy={p0.y} r={6} />
            <circle className="line-handle" cx={p1.x} cy={p1.y} r={6} />
            <circle className="line-handle line-handle-center" cx={mid.x} cy={mid.y} r={6} />
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
