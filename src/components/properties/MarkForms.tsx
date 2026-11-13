import { recolor } from "../../model/recolor";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as commands from "../../commands";
import { getFontOptions, loadBundledFonts } from "../../lib/fonts";
import { shotCaption, shotName } from "../../model/captions";
import * as edits from "../../model/edits";
import { describeLength, lineLength } from "../../model/pageLength";
import { listScenes } from "../../model/shotList";
import type { Ending, LineMark, Mark, PatternTune, Project, TextAlign, TextMark, TextStyle } from "../../model/types";
import { patternFields, tuneLabel, type TuneField } from "../../lib/strokeGeometry";
import { segmentLook, editSegmentTune, editStrokeTune, setSegmentPattern, setSegmentWidth, tunePercent } from "../../model/segments";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";
import { EndingPicker, FillToggle } from "./EndingPicker";
import { OutlineFields } from "./OutlineFields";
import { PatternPicker } from "./PatternPicker";
import { ColorField, Field, Footer, FooterButton, Group, Lockable, NumberInput, Segmented, Select, TextInput, Toggles } from "./parts";

/* Endings the script can draw today. The newer ones join with the next step. */

const apply = (edit: edits.Edit) => useProjectStore.getState().apply(edit);
function step(edit: edits.Edit) {
  breakUndoGroup();
  apply(edit);
  breakUndoGroup();
}

function tuneNumber(look: PatternTune, field: TuneField): number {
  if (field === "side") return 100;
  return tunePercent(look, field);
}

function useFonts() {
  const [, setReady] = useState(false);
  useEffect(() => void loadBundledFonts().then(() => setReady(true)), []);
  return getFontOptions().map((font) => ({ value: font.value, label: font.label }));
}

/* ---------- shared pieces ---------- */

/** Picks the shot a mark is linked to. Linking makes the mark follow the shot's color and caption. */
function LinkGroup({ project, mark }: { project: Project; mark: LineMark | TextMark }) {
  const options = [
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
      edits.updateMark(mark.id, (m) => {
        if (m.kind !== "line" && m.kind !== "text") return m;
        if (!shotId) return edits.unlinkMark(project, m);
        const next = structuredClone(m);
        next.shotId = shotId;
        // A newly linked mark follows its shot until told otherwise.
        delete next.color;
        delete next.own;
        if (next.kind === "line") delete next.caption.text;
        else delete next.text;
        return next;
      })
    );
  return (
    <Group name="mark-link" title="Link">
      <div className="pf-wide pf-link">
        <Select label="Linked shot" value={mark.shotId ?? ""} options={options} onChange={link} />
        {mark.shotId && (
          <button type="button" className="pf-icon-btn" title="Unlink" aria-label="Unlink from shot" onClick={() => link("")}>
            <X size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </Group>
  );
}

function TextStyleFields({ style, fonts, onChange }: { style: TextStyle; fonts: { value: string; label: string }[]; onChange: (patch: Partial<TextStyle>) => void }) {
  return (
    <>
      <Field label="Font">
        <Select label="Font" value={style.font} options={fonts} onChange={(font) => onChange({ font })} />
      </Field>
      <Field label="Size">
        <NumberInput label="Font size" value={style.sizePt} min={4} max={96} unit="pt" onChange={(sizePt) => sizePt && onChange({ sizePt })} />
      </Field>
      <Toggles
        items={[
          { label: <b>B</b>, title: "Bold", on: style.bold, onChange: (bold) => onChange({ bold }) },
          { label: <i>I</i>, title: "Italic", on: style.italic, onChange: (italic) => onChange({ italic }) },
          { label: <u>U</u>, title: "Underline", on: style.underline, onChange: (underline) => onChange({ underline }) },
        ]}
      />
      <Segmented<TextAlign>
        label="Alignment"
        value={style.align}
        options={[
          { value: "left", label: <AlignLeft size={14} />, title: "Align left" },
          { value: "center", label: <AlignCenter size={14} />, title: "Align center" },
          { value: "right", label: <AlignRight size={14} />, title: "Align right" },
        ]}
        onChange={(align) => onChange({ align })}
      />
    </>
  );
}

/** Linked shows the shot's caption read-only; Custom is the mark's own text, starting from the caption. */
function LinkedOrCustom({
  linkedCaption,
  text,
  label,
  onChange,
}: {
  /** Undefined when the mark is not linked: then there is only custom text. */
  linkedCaption: string | undefined;
  text: string | undefined;
  label: string;
  onChange: (text: string | undefined) => void;
}) {
  const custom = text !== undefined || linkedCaption === undefined;
  return (
    <>
      {linkedCaption !== undefined && (
        <div className="pf-wide">
          <Segmented
            label={`${label} source`}
            value={custom ? "custom" : "linked"}
            options={[
              { value: "linked", label: "Linked", title: "Follows the shot" },
              { value: "custom", label: "Custom", title: "Its own text" },
            ]}
            onChange={(mode) => {
              breakUndoGroup();
              onChange(mode === "custom" ? linkedCaption : undefined);
            }}
          />
        </div>
      )}
      <div className="pf-wide">
        {custom ? (
          <TextInput multiline label={label} value={text ?? ""} placeholder={label} onChange={onChange} />
        ) : (
          <p className="pf-readonly" title="Built from the linked shot">
            {linkedCaption || "—"}
          </p>
        )}
      </div>
    </>
  );
}

/** One ending on one row: shape (with previews), size, and fill. */
function EndingFields({ title, value, onChange }: { title: string; value: Ending; onChange: (value: Ending) => void }) {
  return (
    <div className="pf-wide pf-ending">
      <span className="pf-label">{title}</span>
      <EndingPicker label={`${title} ending`} value={value} onChange={(type) => onChange({ ...value, type })} />
      <NumberInput label={`${title} ending size`} value={value.sizePct} min={50} step={10} unit="%" onChange={(sizePct) => sizePct && onChange({ ...value, sizePct })} />
      <FillToggle label={`Fill the ${title.toLowerCase()} ending`} value={value} onChange={(filled) => onChange({ ...value, filled })} />
    </div>
  );
}

function MarkFooter({ onUseAsDefault }: { onUseAsDefault?: () => void }) {
  return (
    <Footer>
      {onUseAsDefault && (
        <FooterButton title="New marks of this kind start with this style (Settings > Mark defaults)" onClick={onUseAsDefault}>
          Set as default
        </FooterButton>
      )}
      <FooterButton onClick={commands.duplicateSelection}>Duplicate</FooterButton>
      <FooterButton danger onClick={commands.deleteSelection}>
        Delete
      </FooterButton>
    </Footer>
  );
}

/* ---------- line ---------- */

export function LineInspector({ project, line }: { project: Project; line: LineMark }) {
  const fonts = useFonts();
  const linked = edits.findShot(project, line.shotId);
  const segmentIndex = useSessionStore((s) => (s.lineSegment?.lineId === line.id ? s.lineSegment.index : null));
  // A line with one segment has nothing to pick between, so it edits the whole stroke.
  const segment =
    line.points.length > 2 && segmentIndex !== null && segmentIndex >= 0 && segmentIndex < line.points.length - 1 ? segmentIndex : null;
  const look = segment === null ? line.stroke : segmentLook(line, segment);
  // Arrows walk the segments in order. With none picked, down starts at the first and up at the last.
  const stepSegment = (by: 1 | -1) => {
    const count = line.points.length - 1;
    const next = segment === null ? (by === 1 ? 0 : count - 1) : Math.min(count - 1, Math.max(0, segment + by));
    useSessionStore.getState().setLineSegment(line.id, next);
  };
  const update = (recipe: (line: LineMark) => LineMark) =>
    apply(edits.updateMark(line.id, (m) => (m.kind === "line" ? recipe(m) : m)));
  const caption = (patch: Partial<LineMark["caption"]>) => update((l) => ({ ...l, caption: { ...l.caption, ...patch } }));

  const useAsDefault = commands.setSelectionAsDefault;

  return (
    <>
      <div className="pf-scroll">
        <LinkGroup project={project} mark={line} />

        <Group name="line-caption" title="Caption" enabled={line.caption.show} onEnabledChange={(show) => caption({ show })}>
          <LinkedOrCustom
            label="Caption"
            linkedCaption={linked ? shotCaption(project, linked, line.own) : undefined}
            text={line.caption.text}
            onChange={(text) =>
              update((l) => {
                const next = { ...l, caption: { ...l.caption } };
                if (text === undefined) delete next.caption.text;
                else next.caption.text = text;
                return next;
              })
            }
          />
          <TextStyleFields style={line.caption} fonts={fonts} onChange={caption} />
          <OutlineFields
            label="Caption outline"
            value={line.caption.outline}
            onChange={(outline) =>
              update((l) => {
                const next = { ...l, caption: { ...l.caption } };
                if (outline) next.caption.outline = outline;
                else delete next.caption.outline;
                return next;
              })
            }
          />
          {line.caption.offset && (
            <div className="pf-wide">
              <FooterButton
                onClick={() =>
                  step(
                    edits.updateMark(line.id, (m) => {
                      if (m.kind !== "line") return m;
                      const { offset: _removed, ...rest } = m.caption;
                      return { ...m, caption: rest };
                    })
                  )
                }
              >
                Reset caption position
              </FooterButton>
            </div>
          )}
        </Group>

        <Group name="line-stroke" title={segment === null ? "Stroke" : `Segment ${segment + 1} of ${line.points.length - 1}`}>
          <Field label="Color">
            <ColorField
              label="Line color"
              color={line.color ?? linked?.shot.color ?? "#FF0000"}
              follows={linked ? line.color === undefined : undefined}
              onChange={(color) => apply((p) => recolor(p, { kind: "mark", ids: [line.id] }, color))}
              onFollowChange={(follows) =>
                update((l) => {
                  if (!follows) return { ...l, color: linked?.shot.color ?? "#FF0000" };
                  const { color: _removed, ...rest } = l;
                  return rest;
                })
              }
            />
          </Field>
          <Field label="Thickness">
            {segment === null ? (
              <NumberInput
                label="Line thickness"
                value={line.stroke.widthPt}
                min={0.25}
                max={24}
                step={0.25}
                unit="len"
                onChange={(widthPt) => {
                  if (!widthPt) return;
                  update((l) => ({ ...l, stroke: { ...l.stroke, widthPt } }));
                }}
              />
            ) : (
              // Locked: the field is the whole line's thickness. Unlocked: this segment's own.
              <Lockable
                locked={line.segments?.[segment]?.widthPt === undefined}
                what="the whole line"
                onToggle={() =>
                  update((l) => {
                    const own = l.segments?.[segment]?.widthPt;
                    return setSegmentWidth(l, segment, own === undefined ? l.stroke.widthPt : undefined);
                  })
                }
              >
                <NumberInput
                  label={line.segments?.[segment]?.widthPt === undefined ? "Line thickness" : "Segment thickness"}
                  value={line.segments?.[segment]?.widthPt ?? line.stroke.widthPt}
                  min={0.25}
                  max={24}
                  step={0.25}
                  unit="len"
                  onChange={(widthPt) => {
                    if (!widthPt) return;
                    update((l) =>
                      l.segments?.[segment]?.widthPt === undefined
                        ? { ...l, stroke: { ...l.stroke, widthPt } }
                        : setSegmentWidth(l, segment, widthPt)
                    );
                  }}
                />
              </Lockable>
            )}
          </Field>
          <Field label="Pattern" wide>
            <PatternPicker
              value={look.pattern}
              onChange={(pattern) =>
                update((l) => (segment === null ? { ...l, stroke: { ...l.stroke, pattern } } : setSegmentPattern(l, segment, pattern)))
              }
            />
          </Field>
          {patternFields(look.pattern).map((field) =>
            field === "side" ? (
              <Field key={field} label={tuneLabel(look.pattern, field)}>
                <Segmented
                  label="Wavy side"
                  value={look.waveSide ?? "right"}
                  options={[
                    { value: "left", label: "Left", title: "Left of the direction the segment runs" },
                    { value: "right", label: "Right", title: "Right of the direction the segment runs" },
                  ]}
                  onChange={(waveSide) =>
                    update((l) =>
                      segment === null
                        ? { ...l, stroke: editStrokeTune(l.stroke, "side", waveSide) }
                        : editSegmentTune(l, segment, "side", waveSide)
                    )
                  }
                />
              </Field>
            ) : (
              <Field key={field} label={tuneLabel(look.pattern, field)}>
                <NumberInput
                  label={tuneLabel(look.pattern, field)}
                  value={tuneNumber(look, field)}
                  min={25}
                  step={5}
                  unit="%"
                  onChange={(value) =>
                    update((l) =>
                      segment === null
                        ? { ...l, stroke: editStrokeTune(l.stroke, field, value) }
                        : editSegmentTune(l, segment, field, value)
                    )
                  }
                />
              </Field>
            )
          )}
          {line.points.length > 2 && (
            <Field label="Bends" wide>
              <Segmented
                label="Bends"
                value={line.smooth ? "smooth" : "corners"}
                options={[
                  { value: "corners", label: "Corners" },
                  { value: "smooth", label: "Smooth curve" },
                ]}
                onChange={(v) =>
                  update((l) => {
                    if (v === "smooth") return { ...l, smooth: true };
                    const { smooth: _off, ...rest } = l;
                    return rest;
                  })
                }
              />
            </Field>
          )}
          <div className="pf-wide pf-link">
            <FooterButton onClick={() => commands.splitSelection()}>Split</FooterButton>
            <FooterButton onClick={() => commands.rejoinSelection()} disabled={line.points.length < 3}>
              Rejoin
            </FooterButton>
            {line.points.length > 2 && (
              <>
                <button
                  type="button"
                  className="pf-icon-btn"
                  title="Previous segment"
                  aria-label="Previous segment"
                  disabled={segment === 0}
                  onClick={() => stepSegment(-1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="pf-icon-btn"
                  title="Next segment"
                  aria-label="Next segment"
                  disabled={segment === line.points.length - 2}
                  onClick={() => stepSegment(1)}
                >
                  <ChevronDown size={16} />
                </button>
              </>
            )}
          </div>
        </Group>

        <Group name="line-endings" title="Endings">
          <EndingFields title="Start" value={line.start} onChange={(start) => update((l) => ({ ...l, start }))} />
          <EndingFields title="End" value={line.end} onChange={(end) => update((l) => ({ ...l, end }))} />
          {/* Mid: one marker at every split point. Offered once the line has a split. */}
          {line.points.length > 2 && (
            <EndingFields
              title="Mid"
              value={line.mid ?? { type: "none", sizePct: 100, filled: true }}
              onChange={(mid) =>
                update((l) => {
                  if (mid.type !== "none") return { ...l, mid };
                  const { mid: _removed, ...rest } = l;
                  return rest;
                })
              }
            />
          )}
        </Group>

        <Group name="line-outline" title="Outline">
          <OutlineFields
            label="Line outline"
            value={line.outline}
            onChange={(outline) =>
              update((l) => {
                if (outline) return { ...l, outline };
                const { outline: _removed, ...rest } = l;
                return rest;
              })
            }
          />
        </Group>

        <p className="pf-summary">This line: {describeLength(lineLength(project, line)).replace(/^1 line · /, "")}</p>
      </div>
      <MarkFooter onUseAsDefault={useAsDefault} />
    </>
  );
}

/* ---------- text note ---------- */

export function TextInspector({ project, note }: { project: Project; note: TextMark }) {
  const fonts = useFonts();
  const linked = edits.findShot(project, note.shotId);
  const update = (recipe: (note: TextMark) => TextMark) =>
    apply(edits.updateMark(note.id, (m) => (m.kind === "text" ? recipe(m) : m)));

  const useAsDefault = commands.setSelectionAsDefault;

  return (
    <>
      <div className="pf-scroll">
        <LinkGroup project={project} mark={note} />
        <Group name="note-text" title="Text" enabled={note.show} onEnabledChange={(show) => update((n) => ({ ...n, show }))}>
          <LinkedOrCustom
            label="Text"
            linkedCaption={linked ? shotCaption(project, linked, note.own) : undefined}
            text={note.text}
            onChange={(text) =>
              update((n) => {
                const next = { ...n };
                if (text === undefined) delete next.text;
                else next.text = text;
                return next;
              })
            }
          />
          <TextStyleFields style={note.style} fonts={fonts} onChange={(patch) => update((n) => ({ ...n, style: { ...n.style, ...patch } }))} />
          <OutlineFields
            label="Text outline"
            value={note.outline}
            onChange={(outline) =>
              update((n) => {
                if (outline) return { ...n, outline };
                const { outline: _removed, ...rest } = n;
                return rest;
              })
            }
          />
          <Field label="Color" wide>
            <ColorField
              label="Text color"
              color={note.color ?? linked?.shot.color ?? "#111111"}
              follows={linked ? note.color === undefined : undefined}
              onChange={(color) => apply((p) => recolor(p, { kind: "mark", ids: [note.id] }, color))}
              onFollowChange={(follows) =>
                update((n) => {
                  if (!follows) return { ...n, color: linked?.shot.color ?? "#111111" };
                  const { color: _removed, ...rest } = n;
                  return rest;
                })
              }
            />
          </Field>
        </Group>
      </div>
      <MarkFooter onUseAsDefault={useAsDefault} />
    </>
  );
}

/** Marks with no form of their own yet. */
export function OtherMarkInspector({ mark }: { mark: Mark }) {
  return (
    <>
      <div className="pf-scroll">
        <p className="pf-empty">This {mark.kind} has no settings yet.</p>
      </div>
      <MarkFooter />
    </>
  );
}
