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
import type { LineAnnotation, NormalizedPoint, TextAnnotation } from "../../types/annotations";
import {
  labelFontWeight,
  labelLayoutFromProject,
  primaryLabelPositionPx,
  secondaryLabelPositionPx,
  viewerScalePxPerPt,
} from "../../lib/labelLayout";
import { lineAngleRad, renderLineCap } from "../../lib/lineCaps";
import { strokeDashArray } from "../../lib/lineStrokes";

type Props = {
  pageNum: number;
  width: number;
  height: number;
};

type DragMode =
  | { type: "draw"; start: NormalizedPoint }
  | { type: "handle"; lineId: string; handle: "start" | "end" | "center"; origin: LineAnnotation }
  | { type: "alt-clone"; lineId: string; origin: LineAnnotation; offset: NormalizedPoint }
  | null;

function hitHandle(
  px: number,
  py: number,
  hx: number,
  hy: number,
  radius = 10
): boolean {
  return (px - hx) ** 2 + (py - hy) ** 2 <= radius * radius;
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
  const applyMarginContinuationTrim = useProjectStore((s) => s.applyMarginContinuationTrim);
  const lineHitTolerancePx = useProjectStore((s) => s.lineHitTolerancePx);
  const selectAnnotation = useProjectStore((s) => s.selectAnnotation);
  const selectShot = useProjectStore((s) => s.selectShot);
  const shotSelection = useProjectStore((s) =>
    s.selection?.kind === "shot" ? s.selection : null
  );

  const [drag, setDrag] = useState<DragMode>(null);
  const [previewEnd, setPreviewEnd] = useState<NormalizedPoint | null>(null);

  const lines = annotationsForPage(project, pageNum).filter((l) =>
    isAnnotationVisible(project, l)
  );
  const texts = textAnnotationsForPage(project, pageNum);

  const getPointUnclamped = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return clientToNormalizedUnclamped(e.clientX, e.clientY, rect);
    },
    []
  );

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

  const findTextAt = (p: NormalizedPoint): TextAnnotation | null => {
    const px = p.x * width;
    const py = p.y * height;
    const r = 22;
    for (const t of [...texts].reverse()) {
      const tx = t.x * width;
      const ty = t.y * height;
      if ((px - tx) ** 2 + (py - ty) ** 2 <= r * r) return t;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
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
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        return;
      }

      for (const line of lines) {
        const selId =
          selection?.kind === "annotation" ? selection.annotationId : null;
        const isSelected = line.id === selId;
        if (!isSelected) continue;

        const p0 = normalizedToPx(line.points[0], width, height);
        const p1 = normalizedToPx(line.points[1], width, height);
        const mid = normalizedToPx(
          { x: (line.points[0].x + line.points[1].x) / 2, y: (line.points[0].y + line.points[1].y) / 2 },
          width,
          height
        );

        if (hitHandle(p.x * width, p.y * height, p0.x, p0.y)) {
          setDrag({ type: "handle", lineId: line.id, handle: "start", origin: line });
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          return;
        }
        if (hitHandle(p.x * width, p.y * height, p1.x, p1.y)) {
          setDrag({ type: "handle", lineId: line.id, handle: "end", origin: line });
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          return;
        }
        if (hitHandle(p.x * width, p.y * height, mid.x, mid.y, 12)) {
          setDrag({ type: "handle", lineId: line.id, handle: "center", origin: line });
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          return;
        }
      }

      const hitText = findTextAt(p);
      if (hitText) {
        selectAnnotation(hitText.id);
        return;
      }

      const hit = findLineAt(p);
      if (hit) {
        selectAnnotation(hit.id);
        if (hit.shotId) {
          const scene = project.scenes.find((sc) =>
            sc.shots.some((sh) => sh.id === hit.shotId)
          );
          if (scene) selectShot(scene.id, hit.shotId!);
        }
        return;
      }
      useProjectStore.getState().clearSelection();
      return;
    }

    if (!isDrawTool) return;

    setDrag({ type: "draw", start: pu });
    setPreviewEnd(pu);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const pu = getPointUnclamped(e);

    if (drag.type === "draw") {
      const end = snapEndpoint(drag.start, pu, snapAngleDegrees, e.shiftKey);
      setPreviewEnd(end);
      return;
    }

    if (drag.type === "handle") {
      const { origin, handle } = drag;
      const [a, b] = origin.points;
      if (handle === "start") {
        const start = snapEndpoint(b, pu, snapAngleDegrees, e.shiftKey);
        updateLine(drag.lineId, { points: [start, b] });
      } else if (handle === "end") {
        const end = snapEndpoint(a, pu, snapAngleDegrees, e.shiftKey);
        updateLine(drag.lineId, { points: [a, end] });
      } else {
        const dx = pu.x - (a.x + b.x) / 2;
        const dy = pu.y - (a.y + b.y) / 2;
        updateLine(drag.lineId, {
          points: [offsetPointUnclamped(a, dx, dy), offsetPointUnclamped(b, dx, dy)],
        });
      }
      return;
    }

    if (drag.type === "alt-clone") {
      setDrag({ ...drag, offset: pu });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pu = getPointUnclamped(e);
    const p = { x: clamp01(pu.x), y: clamp01(pu.y) };
    const tHit = findTextAt(p);
    if (tHit) {
      selectAnnotation(tHit.id);
      useProjectStore.getState().setActiveTool("select");
      return;
    }
    const hit = findLineAt(p);
    if (hit) {
      selectAnnotation(hit.id);
      useProjectStore.getState().setActiveTool("select");
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag) return;

    let trimLineId: string | null = null;
    let trimHint: MarginTrimHint = "drawEnd";

    if (drag.type === "draw") {
      const pu = getPointUnclamped(e);
      let end = snapEndpoint(drag.start, pu, snapAngleDegrees, e.shiftKey);
      if (distance(drag.start, end) < MIN_DRAG_NORMALIZED) {
        end = { x: drag.start.x, y: drag.start.y + MIN_DRAG_NORMALIZED };
      }

      const shotId = shotSelection?.shotId;
      const line = createLineFromShot(pageNum, [drag.start, end], project, shotId);
      addLine(line);
      trimLineId = line.id;
      trimHint = "drawEnd";
    }

    if (drag.type === "alt-clone") {
      const pu = getPointUnclamped(e);
      const start = drag.origin.points[0];
      const dx = pu.x - start.x;
      const dy = pu.y - start.y;
      const dup = cloneLine(drag.origin, pageNum);
      dup.points = [
        offsetPointUnclamped(drag.origin.points[0], dx, dy),
        offsetPointUnclamped(drag.origin.points[1], dx, dy),
      ];
      addLine(dup);
      trimLineId = dup.id;
      trimHint = "center";
    }

    if (drag.type === "handle") {
      trimLineId = drag.lineId;
      trimHint =
        drag.handle === "start" ? "start" : drag.handle === "end" ? "end" : "center";
    }

    if (trimLineId) {
      applyMarginContinuationTrim(trimLineId, pageHeightPt, trimHint);
    }

    setDrag(null);
    setPreviewEnd(null);
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  };

  const selectedId =
    selection?.kind === "annotation" ? selection.annotationId : null;

  const labelLayout = labelLayoutFromProject(project);
  const labelScale = viewerScalePxPerPt(height, pageHeightPt);

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
        const { primary: labelPrimary, secondary: labelSecondary } = getLineScriptLabels(
          line,
          project
        );
        const endIdx = lineEndIndexForContLabel(line);
        const pe = endIdx === 1 ? p1 : p0;
        const fsPt = getLineFontSizePt(line, project);
        const fsPx = fsPt * labelScale;
        const primaryPos = primaryLabelPositionPx(p0, labelLayout, labelScale);
        const secondaryPos = secondaryLabelPositionPx(pe, fsPx, labelLayout, labelScale);
        const labelWeight = labelFontWeight(getLineLabelBold(line, project));
        const isSel = line.id === selectedId;
        const ang = lineAngleRad(p0.x, p0.y, p1.x, p1.y);
        const startCap = renderLineCap(
          style.start,
          style.color,
          style.widthPt,
          ang,
          true
        );
        const endCap = renderLineCap(style.end, style.color, style.widthPt, ang, false);

        return (
          <g key={line.id} className={isSel ? "line-selected" : undefined}>
            <line
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke={style.color}
              strokeWidth={style.widthPt}
              strokeDasharray={strokeDashArray(style.stroke, style.widthPt)}
            />
            {startCap && (
              <g transform={`translate(${p0.x}, ${p0.y})`}>{startCap.elements}</g>
            )}
            {endCap && (
              <g transform={`translate(${p1.x}, ${p1.y})`}>{endCap.elements}</g>
            )}
            {labelPrimary && (
              <text
                x={primaryPos.x}
                y={primaryPos.y}
                fill={style.color}
                fontSize={fsPx}
                fontFamily={getLineFontFamily(line, project)}
                fontWeight={labelWeight}
              >
                {labelPrimary}
              </text>
            )}
            {labelSecondary && (
              <text
                x={secondaryPos.x}
                y={secondaryPos.y}
                fill={style.color}
                fontSize={fsPx}
                fontFamily={getLineFontFamily(line, project)}
                fontWeight={labelWeight}
              >
                {labelSecondary}
              </text>
            )}
            {isSel && (
              <>
                <circle className="line-handle" cx={p0.x} cy={p0.y} r={6} />
                <circle className="line-handle" cx={p1.x} cy={p1.y} r={6} />
                <circle
                  className="line-handle line-handle-center"
                  cx={(p0.x + p1.x) / 2}
                  cy={(p0.y + p1.y) / 2}
                  r={6}
                />
              </>
            )}
          </g>
        );
      })}
      {texts.map((t) => {
        const tx = t.x * width;
        const ty = t.y * height;
        const isSel = t.id === selectedId;
        const textFsPx = (t.fontSize ?? project.defaultLine.fontSizePt) * labelScale;
        return (
          <g key={t.id} className={isSel ? "text-selected" : undefined}>
            <text
              x={tx}
              y={ty}
              fill={t.color}
              fontSize={textFsPx}
              fontFamily={t.fontFamily ?? project.defaultLine.fontFamily}
              fontWeight={labelFontWeight(getTextLabelBold(t, project))}
            >
              {t.text}
            </text>
            {isSel && <circle className="line-handle" cx={tx} cy={ty} r={6} />}
          </g>
        );
      })}
      {drag?.type === "draw" && previewEnd && (
        <line
          x1={normalizedToPx(drag.start, width, height).x}
          y1={normalizedToPx(drag.start, width, height).y}
          x2={normalizedToPx(previewEnd, width, height).x}
          y2={normalizedToPx(previewEnd, width, height).y}
          stroke="#4a9eff"
          strokeWidth={2}
          strokeDasharray="4 4"
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
