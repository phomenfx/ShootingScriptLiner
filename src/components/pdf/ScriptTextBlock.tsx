import type { TextAlign } from "../../types/annotations";
import type { LaidOutRun, TextFrame } from "../../lib/textBox";
import {
  BOX_HANDLES,
  UNDERLINE_THICKNESS_EM,
  alignmentPoint,
  boxHandleCursor,
  boxHandlePoint,
} from "../../lib/textBox";

type Props = {
  frame: TextFrame;
  runs: LaidOutRun[];
  fill: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  selected: boolean;
  /** Line labels only. The box alignment point is the origin; this is the line point it is offset from. */
  anchor?: { x: number; y: number };
  align?: TextAlign;
};

export function ScriptTextBlock({
  frame,
  runs,
  fill,
  fontFamily,
  bold,
  italic,
  selected,
  anchor,
  align = "left",
}: Props) {
  const origin = anchor ? alignmentPoint(frame, align, true) : null;
  const stroke = Math.max(0.75, frame.fontSize * UNDERLINE_THICKNESS_EM);

  return (
    <g className={selected ? "text-selected" : undefined}>
      <text
        fill={fill}
        fontFamily={fontFamily}
        fontSize={frame.fontSize}
        fontWeight={bold ? 600 : 400}
        fontStyle={italic ? "italic" : "normal"}
      >
        {runs.map((run, index) =>
          run.text ? (
            <tspan key={index} x={run.x} y={run.baseline}>
              {run.text}
            </tspan>
          ) : null
        )}
      </text>
      {runs.map((run, index) =>
        run.underline ? (
          <line
            key={`u-${index}`}
            x1={run.underline.x1}
            y1={run.underline.y}
            x2={run.underline.x2}
            y2={run.underline.y}
            stroke={fill}
            strokeWidth={stroke}
            pointerEvents="none"
          />
        ) : null
      )}
      {selected && (
        <>
          <rect
            className="text-box-frame"
            x={frame.left}
            y={frame.top}
            width={frame.width}
            height={frame.height}
          />
          {BOX_HANDLES.map((handle) => {
            const point = boxHandlePoint(frame, handle);
            return (
              <circle
                key={handle}
                className="text-box-handle"
                cx={point.x}
                cy={point.y}
                r={5}
                style={{ cursor: boxHandleCursor(handle) }}
              />
            );
          })}
          {anchor && origin && (
            <>
              <line
                className="text-offset-leader"
                x1={anchor.x}
                y1={anchor.y}
                x2={origin.x}
                y2={origin.y}
              />
              <circle className="text-offset-handle" cx={origin.x} cy={origin.y} r={5} />
            </>
          )}
        </>
      )}
    </g>
  );
}
