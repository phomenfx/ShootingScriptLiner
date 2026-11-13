import { recolor } from "../../model/recolor";
import { X } from "lucide-react";
import * as commands from "../../commands";
import { isFillable, SHAPE_KINDS } from "../../lib/shapeGeometry";
import { patternFields, tuneLabel } from "../../lib/strokeGeometry";
import { shotName } from "../../model/captions";
import * as edits from "../../model/edits";
import { choiceLabel } from "../../model/registry";
import { editStrokeTune, tunePercent } from "../../model/segments";
import { listScenes } from "../../model/shotList";
import type { Project, ShapeMark, Stroke } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { SHAPE_ICONS } from "../pdf/ScriptToolbar";
import { EndingPicker } from "./EndingPicker";
import { ColorField, Field, Footer, FooterButton, Group, NumberInput, Segmented, Select } from "./parts";
import { PatternPicker } from "./PatternPicker";

const apply = (edit: edits.Edit) => useProjectStore.getState().apply(edit);
function step(edit: edits.Edit) {
  breakUndoGroup();
  apply(edit);
  breakUndoGroup();
}

const DEFAULT_STROKE: Stroke = { pattern: "straight", widthPt: 2 };
/** A white halo reads well on a script page. */
const DEFAULT_OUTLINE = { color: "#FFFFFF", widthPt: 1.5 };

/** Properties of a box shape: link, kind, color, stroke, fill and size. */
export function ShapeInspector({ project, shape }: { project: Project; shape: ShapeMark }) {
  const linked = edits.findShot(project, shape.shotId);
  const update = (recipe: (shape: ShapeMark) => ShapeMark) =>
    apply(edits.updateMark(shape.id, (m) => (m.kind === "shape" ? recipe(m) : m)));
  const stroke = shape.stroke ?? DEFAULT_STROKE;
  const setStroke = (next: Stroke) => update((s) => ({ ...s, stroke: next }));
  const hasStroke = shape.shape !== "highlight";
  const fillable = isFillable(shape) || shape.shape === "stamp";

  const shotOptions = [
    { value: "", label: "Not linked" },
    ...listScenes(project).flatMap((l) =>
      l.shots.map((item) => ({
        value: item.shot.id,
        label: shotName(project, { scene: l.scene, shot: item.shot, sceneIndex: l.sceneIndex, shotIndex: item.shotIndex }),
      }))
    ),
  ];
  const link = (shotId: string) =>
    step(
      edits.updateMark(shape.id, (m) => {
        if (m.kind !== "shape") return m;
        if (!shotId) return edits.unlinkMark(project, m);
        const { color: _color, ...rest } = m;
        return { ...rest, shotId };
      })
    );

  /** Switching kind keeps the box; settings only the new kind uses get their usual starting values. */
  const setKind = (kind: string) =>
    step(
      edits.updateMark(shape.id, (m) => {
        if (m.kind !== "shape") return m;
        const next: ShapeMark = { ...m, shape: kind };
        if (kind === "polygon" && next.sides === undefined) next.sides = 6;
        if (kind === "star") {
          next.points ??= 5;
          next.innerDepthPct ??= 50;
        }
        if (kind === "stamp" && next.stamp === undefined) next.stamp = "arrow";
        if (kind === "highlight" && !next.fill) next.fill = { opacityPct: 100 };
        return next;
      })
    );

  const useAsDefault = commands.setSelectionAsDefault;

  return (
    <>
      <div className="pf-scroll">
        <Group name="mark-link" title="Link">
          <div className="pf-wide pf-link">
            <Select label="Linked shot" value={shape.shotId ?? ""} options={shotOptions} onChange={link} />
            {shape.shotId && (
              <button type="button" className="pf-icon-btn" title="Unlink" aria-label="Unlink from shot" onClick={() => link("")}>
                <X size={13} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </Group>

        <Group name="shape-kind" title={shape.shape === "path" ? "Path" : "Shape"}>
          {shape.shape === "path" && shape.path && (
            <Field label="Ends" wide>
              <Segmented
                label="Path ends"
                value={shape.path.closed ? "closed" : "open"}
                options={[
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ]}
                onChange={(v) => update((s) => (s.path ? { ...s, path: { ...s.path, closed: v === "closed" } } : s))}
              />
            </Field>
          )}
          {shape.shape !== "path" && (
          <div className="pf-wide pf-shape-kinds" role="radiogroup" aria-label="Shape">
            {SHAPE_KINDS.map((kind) => {
              const Icon = SHAPE_ICONS[kind]!;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={shape.shape === kind}
                  className={shape.shape === kind ? "on" : undefined}
                  title={choiceLabel("shape", kind)}
                  onClick={() => setKind(kind)}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
          )}
          {shape.shape === "polygon" && (
            <Field label="Sides">
              <NumberInput label="Sides" value={shape.sides ?? 6} min={3} max={64} onChange={(sides) => sides && update((s) => ({ ...s, sides }))} />
            </Field>
          )}
          {shape.shape === "star" && (
            <>
              <Field label="Points">
                <NumberInput label="Star points" value={shape.points ?? 5} min={3} max={64} onChange={(points) => points && update((s) => ({ ...s, points }))} />
              </Field>
              <Field label="Inner depth">
                <NumberInput
                  label="Star inner depth"
                  value={shape.innerDepthPct ?? 50}
                  min={0}
                  max={95}
                  step={5}
                  unit="%"
                  onChange={(innerDepthPct) => innerDepthPct !== undefined && update((s) => ({ ...s, innerDepthPct }))}
                />
              </Field>
            </>
          )}
          {shape.shape === "stamp" && (
            <Field label="Stamp" wide>
              <EndingPicker
                label="Stamp shape"
                value={{ type: shape.stamp ?? "arrow", sizePct: 100, filled: !!shape.fill }}
                onChange={(stamp) => update((s) => ({ ...s, stamp }))}
              />
            </Field>
          )}
        </Group>

        <Group name="shape-look" title={hasStroke ? "Stroke" : "Color"}>
          <Field label="Color">
            <ColorField
              label="Shape color"
              color={shape.color ?? linked?.shot.color ?? project.settings.general.newShotColor}
              follows={linked ? shape.color === undefined : undefined}
              onChange={(color) => apply((p) => recolor(p, { kind: "mark", ids: [shape.id] }, color))}
              onFollowChange={(follows) =>
                update((s) => {
                  if (!follows) return { ...s, color: linked?.shot.color ?? project.settings.general.newShotColor };
                  const { color: _removed, ...rest } = s;
                  return rest;
                })
              }
            />
          </Field>
          {hasStroke && (
            <Field label="Thickness">
              <NumberInput
                label="Stroke thickness"
                value={stroke.widthPt}
                min={0.25}
                step={0.25}
                unit="pt"
                onChange={(widthPt) => widthPt && setStroke({ ...stroke, widthPt })}
              />
            </Field>
          )}
          {hasStroke && shape.shape !== "stamp" && (
            <>
              <Field label="Pattern" wide>
                <PatternPicker value={stroke.pattern} onChange={(pattern) => setStroke({ ...stroke, pattern })} />
              </Field>
              {patternFields(stroke.pattern)
                .filter((field) => field !== "side")
                .map((field) => (
                  <Field key={field} label={tuneLabel(stroke.pattern, field)}>
                    <NumberInput
                      label={tuneLabel(stroke.pattern, field)}
                      value={tunePercent(stroke, field)}
                      min={25}
                      step={5}
                      unit="%"
                      onChange={(value) => value && setStroke(editStrokeTune(stroke, field, value))}
                    />
                  </Field>
                ))}
            </>
          )}
        </Group>

        {fillable && (
          <Group
            name="shape-fill"
            title="Fill"
            enabled={shape.shape === "highlight" || !!shape.fill}
            onEnabledChange={
              shape.shape === "highlight"
                ? undefined
                : (on) =>
                    update((s) => {
                      if (on) return { ...s, fill: { opacityPct: s.shape === "stamp" ? 100 : 25 } };
                      const { fill: _removed, ...rest } = s;
                      return rest;
                    })
            }
          >
            {shape.shape !== "stamp" && (shape.fill || shape.shape === "highlight") && (
              <Field label="Opacity">
                <NumberInput
                  label="Fill opacity"
                  value={shape.fill?.opacityPct ?? 100}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={(opacityPct) => opacityPct !== undefined && update((s) => ({ ...s, fill: { ...s.fill, opacityPct } }))}
                />
              </Field>
            )}
          </Group>
        )}

        {shape.shape !== "highlight" && (
          <Group
            name="shape-outline"
            title="Outline"
            enabled={!!shape.outline}
            onEnabledChange={(on) =>
              update((s) => {
                if (on) return { ...s, outline: s.outline ?? { ...DEFAULT_OUTLINE } };
                const { outline: _removed, ...rest } = s;
                return rest;
              })
            }
          >
            {shape.outline && (
              <>
                <Field label="Color">
                  <ColorField
                    label="Outline color"
                    color={shape.outline.color}
                    onChange={(color) => update((s) => (s.outline ? { ...s, outline: { ...s.outline, color } } : s))}
                  />
                </Field>
                <Field label="Width">
                  <NumberInput
                    label="Outline width"
                    value={shape.outline.widthPt}
                    min={0.25}
                    max={6}
                    step={0.25}
                    unit="pt"
                    onChange={(widthPt) => widthPt && update((s) => (s.outline ? { ...s, outline: { ...s.outline, widthPt } } : s))}
                  />
                </Field>
              </>
            )}
          </Group>
        )}

        <Group name="shape-box" title="Size">
          <Field label="Width">
            <NumberInput label="Width" value={Math.round(shape.widthPt)} min={4} unit="pt" onChange={(widthPt) => widthPt && update((s) => ({ ...s, widthPt }))} />
          </Field>
          <Field label="Height">
            <NumberInput label="Height" value={Math.round(shape.heightPt)} min={4} unit="pt" onChange={(heightPt) => heightPt && update((s) => ({ ...s, heightPt }))} />
          </Field>
          <Field label="Rotation">
            <NumberInput
              label="Rotation"
              value={Math.round(shape.rotation)}
              min={-360}
              max={360}
              step={5}
              unit="°"
              onChange={(rotation) => rotation !== undefined && update((s) => ({ ...s, rotation: ((rotation % 360) + 360) % 360 }))}
            />
          </Field>
        </Group>
      </div>
      <Footer>
        <FooterButton title="New shapes start with this style (Settings > Mark defaults)" onClick={useAsDefault}>
          Set as default
        </FooterButton>
        <FooterButton onClick={commands.duplicateSelection}>Duplicate</FooterButton>
        <FooterButton danger onClick={commands.deleteSelection}>
          Delete
        </FooterButton>
      </Footer>
    </>
  );
}
