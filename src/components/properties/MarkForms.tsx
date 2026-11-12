import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as commands from "../../commands";
import { getFontOptions, loadBundledFonts } from "../../lib/fonts";
import { shotCaption, shotName } from "../../model/captions";
import * as edits from "../../model/edits";
import { describeLength, lineLength } from "../../model/pageLength";
import { choiceEntries } from "../../model/registry";
import { listScenes } from "../../model/shotList";
import type { Ending, LineMark, Mark, Project, TextAlign, TextMark, TextStyle } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { ColorField, Field, Footer, FooterButton, Group, NumberInput, Segmented, Select, TextInput, Toggles } from "./parts";

/* Patterns and endings the script can draw today. The newer ones join as they are built. */
const DRAWABLE_PATTERNS = ["straight", "dashed_2_2", "dashed_3_3", "dashed_4_4", "dashed_4_3_2_3", "dashed_4_3_16_3", "dashed_8_4_4_4", "dotted"];
const DRAWABLE_ENDINGS = ["none", "square", "circle", "diamond", "arrow", "arrowReversed", "butt", "slash"];
const FILLABLE_ENDINGS = ["square", "circle", "diamond", "arrow", "arrowReversed"];

const apply = (edit: edits.Edit) => useProjectStore.getState().apply(edit);
function step(edit: edits.Edit) {
  breakUndoGroup();
  apply(edit);
  breakUndoGroup();
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

function EndingFields({ title, value, onChange }: { title: string; value: Ending; onChange: (value: Ending) => void }) {
  const options = choiceEntries("ending", undefined)
    .filter((e) => DRAWABLE_ENDINGS.includes(e.key))
    .map((e) => ({ value: e.key, label: e.label }));
  const fillable = FILLABLE_ENDINGS.includes(value.type);
  return (
    <>
      <Field label={title} wide>
        <Select label={`${title} ending`} value={value.type} options={options} onChange={(type) => onChange({ ...value, type })} />
      </Field>
      <label className="pf-check">
        <input type="checkbox" checked={fillable && value.filled} disabled={!fillable} onChange={(e) => onChange({ ...value, filled: e.target.checked })} />
        Filled
      </label>
      <Field label="Size">
        <NumberInput label={`${title} ending size`} value={value.sizePct} min={50} max={350} step={10} unit="%" onChange={(sizePct) => sizePct && onChange({ ...value, sizePct })} />
      </Field>
    </>
  );
}

function MarkFooter({ onUseAsDefault }: { onUseAsDefault?: () => void }) {
  return (
    <Footer>
      {onUseAsDefault && (
        <FooterButton title="New marks will start with this one's style" onClick={onUseAsDefault}>
          Use as default
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
  const update = (recipe: (line: LineMark) => LineMark) =>
    apply(edits.updateMark(line.id, (m) => (m.kind === "line" ? recipe(m) : m)));
  const caption = (patch: Partial<LineMark["caption"]>) => update((l) => ({ ...l, caption: { ...l.caption, ...patch } }));
  const patterns = choiceEntries("pattern", undefined)
    .filter((e) => DRAWABLE_PATTERNS.includes(e.key))
    .map((e) => ({ value: e.key, label: e.label }));

  const useAsDefault = () =>
    step(
      edits.updateSettings((s) => {
        const { show: _s, text: _t, offset: _o, widthPt: _w, minHeightPt: _h, outline: _ol, ...style } = line.caption;
        return {
          ...s,
          markDefaults: {
            ...s.markDefaults,
            line: { ...s.markDefaults.line, stroke: { ...line.stroke }, start: { ...line.start }, end: { ...line.end }, caption: style },
            // Captions and notes share one text style for now.
            text: { ...s.markDefaults.text, style },
          },
        };
      })
    );

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

        <Group name="line-stroke" title="Stroke">
          <Field label="Color">
            <ColorField
              label="Line color"
              color={line.color ?? linked?.shot.color ?? "#FF0000"}
              follows={linked ? line.color === undefined : undefined}
              onChange={(color) => update((l) => ({ ...l, color }))}
              onFollowChange={(follows) =>
                update((l) => {
                  if (!follows) return { ...l, color: linked?.shot.color ?? "#FF0000" };
                  const { color: _removed, ...rest } = l;
                  return rest;
                })
              }
            />
          </Field>
          <Field label="Width">
            <NumberInput label="Line width" value={line.stroke.widthPt} min={0.25} max={24} step={0.25} unit="pt" onChange={(widthPt) => widthPt && update((l) => ({ ...l, stroke: { ...l.stroke, widthPt } }))} />
          </Field>
          <Field label="Pattern" wide>
            <Select label="Pattern" value={line.stroke.pattern} options={patterns} onChange={(pattern) => update((l) => ({ ...l, stroke: { ...l.stroke, pattern } }))} />
          </Field>
          <div className="pf-wide pf-link">
            <FooterButton onClick={() => commands.splitSelection()}>Split</FooterButton>
            <FooterButton onClick={() => commands.rejoinSelection()} disabled={line.points.length < 3}>
              Rejoin
            </FooterButton>
          </div>
        </Group>

        <Group name="line-endings" title="Endings">
          <EndingFields title="Start" value={line.start} onChange={(start) => update((l) => ({ ...l, start }))} />
          <EndingFields title="End" value={line.end} onChange={(end) => update((l) => ({ ...l, end }))} />
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

  const useAsDefault = () =>
    step(
      edits.updateSettings((s) => ({
        ...s,
        markDefaults: {
          ...s.markDefaults,
          text: { ...s.markDefaults.text, color: note.color ?? s.markDefaults.text.color, style: { ...note.style } },
          line: { ...s.markDefaults.line, caption: { ...note.style } },
        },
      }))
    );

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
          <Field label="Color" wide>
            <ColorField
              label="Text color"
              color={note.color ?? linked?.shot.color ?? "#111111"}
              follows={linked ? note.color === undefined : undefined}
              onChange={(color) => update((n) => ({ ...n, color }))}
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
