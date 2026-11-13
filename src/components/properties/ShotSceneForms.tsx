import { revisionColor, revisionLabel } from "../../model/revisions";
import { sceneNumber, shotSuffixes } from "../../model/numbering";
import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import * as commands from "../../commands";
import { cameraRowPrints, captionFieldText, printsField, printsSceneNumber, shotCaption, withCameraRowPrint, withMarkPrint, withPrintField, withSceneNumberPrint } from "../../model/captions";
import { createShot } from "../../model/defaults";
import * as edits from "../../model/edits";
import { describeLength, formatEighths, formatPageRange, sceneLength, shotLength } from "../../model/pageLength";
import { choiceEntries, choiceLabel, keyForText } from "../../model/registry";
import type {CameraRow, LineMark, MarkOwn, Project, Scene, Shot, ShotOwn, TextMark } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { Chips, ColorField, CommitInput, Field, Footer, FooterButton, Group, Lockable, LockButton, NumberInput, Select, TextInput } from "./parts";

const INDICATORS = ["INT.", "EXT.", "INT./EXT."];
const TIMES = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "LATER", "CONTINUOUS"];

const apply = (edit: edits.Edit) => useProjectStore.getState().apply(edit);
function step(edit: edits.Edit) {
  breakUndoGroup();
  apply(edit);
  breakUndoGroup();
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/* ---------- camera rows ---------- */

/** Print checkboxes for each camera row: one for its name, one for its lenses. */
type RowPrint = {
  prints: (part: "camera" | "lens", index: number) => boolean;
  set: (part: "camera" | "lens", index: number, on: boolean) => void;
  removed: (index: number) => void;
};

export function CameraRows({
  cameras,
  disabled,
  print,
  onChange,
}: {
  cameras: CameraRow[];
  disabled?: boolean;
  print?: RowPrint;
  onChange: (cameras: CameraRow[]) => void;
}) {
  const setRow = (index: number, patch: Partial<CameraRow>) =>
    onChange(cameras.map((camera, i) => (i === index ? { ...camera, ...patch } : camera)));
  const tick = (part: "camera" | "lens", index: number, name: string) =>
    print && (
      <input
        type="checkbox"
        className="pf-camera-tick"
        checked={print.prints(part, index)}
        aria-label={`Print ${part === "camera" ? "camera" : "lenses of"} ${name} in the caption`}
        title={`Print ${part === "camera" ? "this camera" : "these lenses"} in the caption`}
        onChange={(e) => print.set(part, index, e.target.checked)}
      />
    );
  return (
    <div className="pf-cameras">
      {cameras.map((camera, index) => (
        <div className="pf-camera" key={index}>
          {tick("camera", index, camera.name || `camera ${index + 1}`)}
          <input
            className="pf-input pf-camera-name"
            aria-label={`Camera ${index + 1} name`}
            placeholder="Cam"
            value={camera.name}
            disabled={disabled}
            onChange={(e) => setRow(index, { name: e.target.value })}
          />
          {tick("lens", index, camera.name || `camera ${index + 1}`)}
          <Chips
            values={camera.lenses}
            label={`Lenses of camera ${camera.name || index + 1}`}
            placeholder="Lens…"
            disabled={disabled}
            onChange={(lenses) => setRow(index, { lenses })}
          />
          {!disabled && (
            <button type="button" className="pf-icon-btn" title="Remove camera" aria-label={`Remove camera ${camera.name || index + 1}`} onClick={() => {
                print?.removed(index);
                onChange(cameras.filter((_, i) => i !== index));
              }}>
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="pf-btn pf-btn-small" onClick={() => onChange([...cameras, { name: "", lenses: [] }])}>
          <Plus size={12} strokeWidth={2} /> Camera
        </button>
      )}
      {disabled && cameras.length === 0 && <span className="pf-none">None</span>}
    </div>
  );
}

function syncOptions(project: Project) {
  return [{ value: "", label: "—" }, ...choiceEntries("sync", project.settings.lists).map((e) => ({ value: e.key, label: e.label }))];
}

/* ---------- shot ---------- */

type ShotInspectorProps = {
  project: Project;
  found: edits.FoundShot;
  /** True when shown as the Shot tab of a selected mark. */
  asTab: boolean;
  /**
   * The linked line or note whose Shot tab this is. Its Shot fields then carry
   * a lock: locked follows the shot, unlocked is that one mark's own value.
   */
  mark?: LineMark | TextMark;
  /** The selected mark whose Shot tab this is (any kind): a shot number another shot has relinks it. */
  markId?: string;
};

type MarkField = "type" | "angle" | "subject" | "cast" | "tags" | "additionalInfo" | "setup" | "notes";

export function ShotInspector({ project, found, asTab, mark, markId }: ShotInspectorProps) {
  const { scene, shot, sceneIndex, shotIndex } = found;
  const style = project.settings.general.shotIdStyle;
  const sceneNo = sceneNumber(project, sceneIndex);
  const shotNo = shotSuffixes(scene, style)[shotIndex] ?? "";
  const linkId = asTab ? (markId ?? mark?.id) : undefined;
  const lists = project.settings.lists;
  const own = shot.own ?? {};
  const id = captionFieldText(project, found, "shotNumber");
  const length = shotLength(project, shot.id);

  const patch = (p: Partial<Shot>) =>
    apply(
      edits.updateShot(shot.id, (current) => {
        const next = { ...current, ...p };
        for (const key of Object.keys(p) as (keyof Shot)[]) {
          const value = next[key];
          if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
        }
        return next;
      })
    );
  /* On a mark's Shot tab, each Shot field is either the shot's (locked) or that mark's own (unlocked). */
  const markOwn = mark?.own ?? {};
  const isOwn = (key: MarkField) => !!mark && markOwn[key] !== undefined;
  const setMarkOwn = <K extends keyof MarkOwn>(key: K, value: MarkOwn[K] | undefined) => {
    if (!mark) return;
    apply(
      edits.updateMark(mark.id, (m) => {
        if (m.kind !== "line" && m.kind !== "text") return m;
        const next: MarkOwn = { ...m.own };
        if (value === undefined) delete next[key];
        else next[key] = value;
        if (Object.keys(next).length > 0) return { ...m, own: next };
        const { own: _removed, ...rest } = m;
        return rest;
      })
    );
  };
  /** The value a Shot field shows: the mark's own when unlocked, else the shot's. */
  const shown = <K extends MarkField>(key: K): MarkOwn[K] => (isOwn(key) ? markOwn[key] : (shot[key] as MarkOwn[K]));
  /** Writes a Shot field to the mark when unlocked, else to the shot. */
  const write = <K extends MarkField>(key: K, value: NonNullable<MarkOwn[K]>) => {
    if (isOwn(key)) setMarkOwn(key, value);
    else patch({ [key]: value } as Partial<Shot>);
  };
  /** Adds the mark's lock to a Shot field. Without a mark the field is shown as it is. */
  const withMarkLock = (key: MarkField, field: ReactNode) => {
    if (!mark) return field;
    const locked = !isOwn(key);
    const empty = key === "cast" || key === "tags" ? [] : "";
    return (
      <Lockable
        locked={locked}
        what={`shot ${id} (editing here changes the shot)`}
        onToggle={() => {
          breakUndoGroup();
          setMarkOwn(key, locked ? (structuredClone(shot[key] ?? empty) as MarkOwn[typeof key]) : undefined);
          breakUndoGroup();
        }}
      >
        {field}
      </Lockable>
    );
  };
  /** An unlocked text field left empty goes back to following the shot. */
  const relockMarkIfEmpty = (key: MarkField) => (value: string) => {
    if (value.trim() === "" && isOwn(key)) setMarkOwn(key, undefined);
  };

  /*
   * Caption checkboxes. On a line's or note's Shot tab they are that mark's
   * own (stored where they differ from the shot); on the shot's form they set
   * the shot's default.
   */
  const printShot = withMarkPrint(found, mark?.own).shot;
  const setMarkPrint = (key: string, on: boolean, shotValue: boolean) => {
    if (!mark) return;
    const next = { ...markOwn.print };
    if (on === shotValue) delete next[key];
    else next[key] = on;
    setMarkOwn("print", Object.keys(next).length > 0 ? next : undefined);
  };
  const print = (fieldId: string) => ({
    print: printsField(project, printShot, fieldId),
    onPrintChange: (on: boolean) =>
      mark
        ? setMarkPrint(fieldId, on, printsField(project, shot, fieldId))
        : apply(edits.updateShot(shot.id, (current) => withPrintField(project, current, fieldId, on))),
  });
  const setOwn = <K extends keyof ShotOwn>(field: K, value: ShotOwn[K] | undefined) => apply(edits.setShotOwn(shot.id, field, value));

  /* Fields a shot takes from its scene. Locked fields stay editable and edit what they follow. */
  const sceneValue = <K extends keyof ShotOwn>(field: K): ShotOwn[K] =>
    (field === "indicator" || field === "location" || field === "time"
      ? scene.heading[field as "indicator" | "location" | "time"]
      : scene.defaults[field as keyof typeof scene.defaults]) as ShotOwn[K];
  const setScene = <K extends keyof ShotOwn>(field: K, value: NonNullable<ShotOwn[K]>) =>
    apply(
      edits.updateScene(scene.id, (s) =>
        field === "indicator" || field === "location" || field === "time"
          ? { ...s, heading: { ...s.heading, [field]: value } }
          : { ...s, defaults: { ...s.defaults, [field]: value } }
      )
    );
  const shotValue = <K extends keyof ShotOwn>(field: K): ShotOwn[K] => own[field] ?? sceneValue(field);
  /** Edits the shot's value: its own when unlocked, else the scene's. */
  const writeShot = <K extends keyof ShotOwn>(field: K, value: NonNullable<ShotOwn[K]>) =>
    own[field] !== undefined ? setOwn(field, value) : setScene(field, value);

  /**
   * One inherited field. On a shot the lock is shot vs scene. On a mark's Shot tab
   * the lock is mark vs shot, the same as the Shot group above.
   */
  const inherit = <K extends keyof ShotOwn>(field: K, empty: NonNullable<ShotOwn[K]>) => {
    const toggle = (run: () => void) => () => {
      breakUndoGroup();
      run();
      breakUndoGroup();
    };
    if (mark) {
      const locked = markOwn[field] === undefined;
      return {
        locked,
        what: `shot ${id}`,
        value: (locked ? shotValue(field) : markOwn[field]) as ShotOwn[K],
        set: (value: NonNullable<ShotOwn[K]>) => (locked ? writeShot(field, value) : setMarkOwn(field, value as MarkOwn[K])),
        onToggle: toggle(() => setMarkOwn(field, (locked ? structuredClone(shotValue(field) ?? empty) : undefined) as MarkOwn[K])),
      };
    }
    const locked = own[field] === undefined;
    return {
      locked,
      what: `scene ${sceneNumber(project, sceneIndex)}`,
      value: shotValue(field),
      set: (value: NonNullable<ShotOwn[K]>) => writeShot(field, value),
      onToggle: toggle(() => setOwn(field, locked ? structuredClone(sceneValue(field) ?? empty) : undefined)),
    };
  };
  const lockOf = (l: { locked: boolean; what: string; onToggle: () => void }) => ({ locked: l.locked, what: l.what, onToggle: l.onToggle });

  const inheritText = (field: "indicator" | "location" | "time" | "fps" | "date", label: string, suggestions?: string[], type?: "date") => {
    const l = inherit(field, "");
    return (
      <Lockable {...lockOf(l)}>
        <TextInput
          type={type}
          label={label}
          value={l.value ?? ""}
          suggestions={suggestions}
          onChange={(value) => l.set(value)}
          // An unlocked field left empty goes back to following.
          onBlur={(value) => {
            if (value.trim() === "" && !l.locked) l.onToggle();
          }}
        />
      </Lockable>
    );
  };

  const tagLabel = (key: string) => choiceLabel("tags", key, lists);
  const setTags = (labels: string[]) => {
    // Chips hand back keys for existing tags and typed text for new ones.
    const known = lists.tags ?? [];
    const added = [...known];
    const keys = labels.map((value) => {
      const hit = added.find((tag) => tag.key === value || tag.label.toLowerCase() === value.toLowerCase());
      if (hit) return hit.key;
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
      const tag = { key: `custom:${slug}`, label: value };
      added.push(tag);
      return tag.key;
    });
    if (added.length !== known.length) {
      apply(edits.updateSettings((s) => ({ ...s, lists: { ...s.lists, tags: added } })));
    }
    write("tags", [...new Set(keys)]);
  };

  const deleteShot = async () => {
    if (length.lineCount > 0 && usePrefsStore.getState().confirmDeletes) {
      const message = `Delete shot ${id}? Its ${plural(length.lineCount, "line")} will stay on the script, unlinked.`;
      if (!(await commands.confirm(message, "Delete", true))) return;
    }
    useSessionStore.getState().clearSelection();
    step(edits.deleteShot(shot.id));
  };

  const deleteLines = async () => {
    if (usePrefsStore.getState().confirmDeletes) {
      if (!(await commands.confirm(`Delete all ${plural(length.lineCount, "line")} of shot ${id}?`, "Delete", true))) return;
    }
    if (asTab) useSessionStore.getState().select("shot", shot.id);
    step(edits.deleteLinesForShot(shot.id));
  };

  const movement = inherit("movement", []);
  const system = inherit("system", []);
  const cameras = inherit("cameras", []);
  const audio = inherit("audio", []);
  const sync = inherit("sync", "");
  const rowPrint = {
    prints: (part: "camera" | "lens", index: number) => cameraRowPrints(project, printShot, part, index),
    set: (part: "camera" | "lens", index: number, on: boolean) =>
      mark
        ? setMarkPrint(`${part}:${index}`, on, cameraRowPrints(project, shot, part, index))
        : apply(edits.updateShot(shot.id, (current) => withCameraRowPrint(project, current, part, index, on))),
    // Rows after a removed one move up, so their checkboxes move with them.
    removed: (index: number) =>
      apply(
        edits.updateShot(shot.id, (current) => {
          if (!current.print) return current;
          const next: Record<string, boolean> = {};
          for (const [key, value] of Object.entries(current.print)) {
            const m = /^(camera|lens):(\d+)$/.exec(key);
            if (!m) next[key] = value;
            else if (Number(m[2]) < index) next[key] = value;
            else if (Number(m[2]) > index) next[`${m[1]}:${Number(m[2]) - 1}`] = value;
          }
          return { ...current, print: next };
        })
      ),
  };

  return (
    <>
      <div className="pf-scroll">
        <div className="pf-shot-top">
          <ColorField color={shot.color} label={`Color of shot ${id}`} onChange={(color) => patch({ color })} />
          {shot.revision && project.settings.revisions?.enabled && (
            <span className="revision-chip" style={{ background: revisionColor(shot.revision) }} title={`Changed in the ${revisionLabel(shot.revision)} revision`} />
          )}
          <div className="pf-caption-preview" style={{ color: shot.color }} title="Caption preview: how this shot's lines are labeled">
            {shotCaption(project, found, mark?.own) || <span className="pf-none">No caption</span>}
          </div>
        </div>

        <Group name="shot" title="Shot" note={mark ? `checkboxes: this ${mark.kind === "text" ? "note" : "line"} only` : undefined}>
          <Field
            label="Scene #"
            hint="Type another scene's number to move this shot there."
            print={printsSceneNumber(project, printShot)}
            onPrintChange={(on) =>
              mark
                ? setMarkPrint("sceneNumber", on, printsSceneNumber(project, shot))
                : apply(edits.updateShot(shot.id, (current) => withSceneNumberPrint(project, current, on)))
            }
          >
            <CommitInput label="Scene number" value={sceneNo} onCommit={(text) => commands.renumberShot(shot.id, text || sceneNo, shotNo, linkId)} />
          </Field>
          <Field
            label="Shot #"
            hint={
              linkId
                ? "A free number renumbers this shot (gaps are fine). Another shot's number links this mark to that shot. Leave empty to count on from the shot before."
                : "A free number renumbers this shot (gaps are fine). Another shot's number swaps the two. Leave empty to count on from the shot before."
            }
            {...print("shotNumber")}
          >
            <CommitInput label="Shot number" value={shot.number === undefined ? "" : shotNo} placeholder={shotNo} onCommit={(text) => commands.renumberShot(shot.id, sceneNo, text, linkId)} />
          </Field>
          <Field label="Shot type" {...print("type")}>
            {withMarkLock(
              "type",
              <TextInput label="Shot type" value={shown("type") ?? ""} placeholder="WS, MS, CU…" onChange={(type) => write("type", type)} onBlur={relockMarkIfEmpty("type")} />
            )}
          </Field>
          <Field label="Angle" {...print("angle")}>
            {withMarkLock(
              "angle",
              <TextInput
                label="Angle"
                value={choiceLabel("angle", shown("angle"), lists)}
                suggestions={choiceEntries("angle", lists).map((e) => e.label)}
                onChange={(text) => write("angle", keyForText("angle", text, lists))}
                onBlur={relockMarkIfEmpty("angle")}
              />
            )}
          </Field>
          <Field label="Subject" wide {...print("subject")}>
            {withMarkLock(
              "subject",
              <TextInput label="Subject" value={shown("subject") ?? ""} onChange={(subject) => write("subject", subject)} onBlur={relockMarkIfEmpty("subject")} />
            )}
          </Field>
          <Field label="Cast" wide {...print("cast")}>
            {withMarkLock("cast", <Chips values={shown("cast") ?? []} label="Add cast" onChange={(cast) => write("cast", cast)} />)}
          </Field>
          <Field label="Tags" wide {...print("tags")}>
            {withMarkLock(
              "tags",
              <Chips values={shown("tags") ?? []} label="Add tag" display={tagLabel} suggestions={(lists.tags ?? []).map((t) => t.label)} onChange={setTags} />
            )}
          </Field>
          <Field label="Additional info" wide {...print("additionalInfo")}>
            {withMarkLock(
              "additionalInfo",
              <TextInput
                label="Additional info"
                value={shown("additionalInfo") ?? ""}
                onChange={(additionalInfo) => write("additionalInfo", additionalInfo)}
                onBlur={relockMarkIfEmpty("additionalInfo")}
              />
            )}
          </Field>
        </Group>

        <Group name="shot-scene" title="Scene" note={`from scene ${sceneNumber(project, sceneIndex)}`}>
          <div className="pf-three pf-wide">
            <Field label="Indicator" {...print("indicator")}>
              {inheritText("indicator", "Indicator", INDICATORS)}
            </Field>
            <Field label="Location" {...print("location")}>
              {inheritText("location", "Location")}
            </Field>
            <Field label="Time" {...print("time")}>
              {inheritText("time", "Time", TIMES)}
            </Field>
          </div>
        </Group>

        <Group name="shot-camera" title="Camera & Sound">
          <Field label="Movement" wide {...print("movement")}>
            <Lockable {...lockOf(movement)}>
              <Chips values={movement.value ?? []} label="Add movement" onChange={movement.set} />
            </Lockable>
          </Field>
          <Field label="System" wide {...print("system")}>
            <Lockable {...lockOf(system)}>
              <Chips values={system.value ?? []} label="Add system" onChange={system.set} />
            </Lockable>
          </Field>
          <div className="pf-field pf-wide">
            <span className="pf-label">
              Camera and lens
              <span className="pf-label-end">
                <LockButton {...lockOf(cameras)} />
              </span>
            </span>
            <CameraRows cameras={cameras.value ?? []} print={rowPrint} onChange={cameras.set} />
          </div>
          <Field label="Audio" wide {...print("audio")}>
            <Lockable {...lockOf(audio)}>
              <Chips values={audio.value ?? []} label="Add audio" onChange={audio.set} />
            </Lockable>
          </Field>
          <Field label="FPS" {...print("fps")}>
            {inheritText("fps", "FPS")}
          </Field>
          <Field label="Sync" {...print("sync")}>
            <Lockable {...lockOf(sync)}>
              <Select label="Sync" value={sync.value ?? ""} options={syncOptions(project)} onChange={sync.set} />
            </Lockable>
          </Field>
        </Group>

        <Group name="shot-schedule" title="Schedule & Notes">
          <Field label="Status">
            <Select label="Status" value={shot.status} options={choiceEntries("status", lists).map((e) => ({ value: e.key, label: e.label }))} onChange={(status) => patch({ status })} />
          </Field>
          <Field label="Priority">
            <Select label="Priority" value={shot.priority} options={choiceEntries("priority", lists).map((e) => ({ value: e.key, label: e.label }))} onChange={(priority) => patch({ priority })} />
          </Field>
          <Field label="Setup" {...print("setup")}>
            {withMarkLock("setup", <TextInput label="Setup" value={shown("setup") ?? ""} onChange={(setup) => write("setup", setup)} onBlur={relockMarkIfEmpty("setup")} />)}
          </Field>
          <Field label="Est. time">
            <NumberInput label="Estimated time in minutes" value={shot.estimatedMinutes} min={0} max={9999} unit="min" allowEmpty onChange={(estimatedMinutes) => patch({ estimatedMinutes })} />
          </Field>
          <Field label="Scheduled date" wide {...print("date")}>
            {inheritText("date", "Scheduled date", undefined, "date")}
          </Field>
          <Field label="Notes" wide {...print("notes")}>
            {withMarkLock("notes", <TextInput multiline label="Notes" value={shown("notes") ?? ""} onChange={(notes) => write("notes", notes)} onBlur={relockMarkIfEmpty("notes")} />)}
          </Field>
        </Group>

        <p className="pf-summary">{describeLength(length)}</p>
      </div>
      <Footer>
        {asTab ? (
          <FooterButton onClick={() => useSessionStore.getState().select("shot", shot.id)}>Select Shot</FooterButton>
        ) : (
          <FooterButton disabled={length.lineCount === 0} title={length.lineCount === 0 ? "Not on script" : undefined} onClick={() => commands.jumpToShot(shot.id)}>
            {length.lineCount === 0 ? "Not on script" : "Show on script"}
          </FooterButton>
        )}
        {!asTab && <FooterButton onClick={() => commands.duplicateSelection()}>Duplicate</FooterButton>}
        <FooterButton danger onClick={() => void deleteShot()}>
          Delete shot
        </FooterButton>
        <FooterButton danger disabled={length.lineCount === 0} onClick={() => void deleteLines()}>
          Delete all lines
        </FooterButton>
      </Footer>
    </>
  );
}

/* ---------- scene ---------- */

export function SceneInspector({ project, scene }: { project: Project; scene: Scene }) {
  const sceneIndex = project.scenes.indexOf(scene);
  const number = sceneNumber(project, sceneIndex);
  const length = sceneLength(project, scene.shots.map((shot) => shot.id));
  const minutes = scene.shots.reduce((sum, shot) => sum + (shot.estimatedMinutes ?? 0), 0);

  const heading = (patch: Partial<Scene["heading"]>) =>
    apply(edits.updateScene(scene.id, (s) => ({ ...s, heading: { ...s.heading, ...patch } })));
  const defaults = (patch: Partial<Scene["defaults"]>) =>
    apply(
      edits.updateScene(scene.id, (s) => {
        const next = { ...s.defaults, ...patch };
        for (const key of ["fps", "sync", "date"] as const) if (!next[key]) delete next[key];
        return { ...s, defaults: next };
      })
    );

  const addShot = () => {
    const shot = createShot(project);
    step(edits.addShot(scene.id, shot));
    useSessionStore.getState().setSceneCollapsed(scene.id, false);
    useSessionStore.getState().select("shot", shot.id);
  };

  const deleteScene = async () => {
    if (length.lineCount > 0 && usePrefsStore.getState().confirmDeletes) {
      const message = `Delete scene ${number} and its ${plural(scene.shots.length, "shot")}? Its ${plural(length.lineCount, "line")} will stay on the script, unlinked.`;
      if (!(await commands.confirm(message, "Delete", true))) return;
    }
    useSessionStore.getState().clearSelection();
    step(edits.deleteScene(scene.id));
  };

  const summary = [
    plural(scene.shots.length, "shot"),
    plural(length.lineCount, "line"),
    formatPageRange(length.pages),
    length.lineCount > 0 ? `${formatEighths(length.eighths)} pgs` : "",
    minutes > 0 ? `${minutes} min` : "",
  ].filter(Boolean);

  return (
    <>
      <div className="pf-scroll">
        <Group name="scene" title={`Scene ${number}`}>
          <Field label="Scene #" hint="A free number moves the scene there in order (5A, 12…). Another scene's number swaps the two. Leave empty to count on from the scene before.">
            <CommitInput label="Scene number" value={scene.number ?? ""} placeholder={number} onCommit={(text) => commands.renumberScene(scene.id, text)} />
          </Field>
          {scene.shots.some((s) => s.number !== undefined) ? (
            <Field label="Shot numbers" hint="Some shots here have typed numbers.">
              <button type="button" className="pf-btn pf-btn-fill" title="Forget typed shot numbers: shots count 1A, 1B… in list order again" onClick={() => commands.renumberShotsInOrder(scene.id)}>
                Fix order
              </button>
            </Field>
          ) : (
            <div />
          )}
          <div className="pf-three pf-wide">
            <Field label="Indicator">
              <TextInput label="Indicator" value={scene.heading.indicator} placeholder="INT." suggestions={INDICATORS} onChange={(indicator) => heading({ indicator })} />
            </Field>
            <Field label="Location">
              <TextInput label="Location" value={scene.heading.location} onChange={(location) => heading({ location })} />
            </Field>
            <Field label="Time">
              <TextInput label="Time" value={scene.heading.time} placeholder="DAY" suggestions={TIMES} onChange={(time) => heading({ time })} />
            </Field>
          </div>
        </Group>
        <Group name="scene-defaults" title="Shot defaults">
          <Field label="Movement" wide hint="Shots in this scene use these values until they set their own.">
            <Chips values={scene.defaults.movement} label="Add movement" onChange={(movement) => defaults({ movement })} />
          </Field>
          <Field label="System" wide>
            <Chips values={scene.defaults.system ?? []} label="Add system" onChange={(system) => defaults({ system })} />
          </Field>
          <Field label="Camera and lens" wide>
            <CameraRows cameras={scene.defaults.cameras} onChange={(cameras) => defaults({ cameras })} />
          </Field>
          <Field label="Audio" wide>
            <Chips values={scene.defaults.audio} label="Add audio" onChange={(audio) => defaults({ audio })} />
          </Field>
          <Field label="FPS">
            <TextInput label="FPS" value={scene.defaults.fps ?? ""} onChange={(fps) => defaults({ fps })} />
          </Field>
          <Field label="Sync">
            <Select label="Sync" value={scene.defaults.sync ?? ""} options={syncOptions(project)} onChange={(sync) => defaults({ sync })} />
          </Field>
          <Field label="Scheduled date" wide>
            <TextInput type="date" label="Scheduled date" value={scene.defaults.date ?? ""} onChange={(date) => defaults({ date })} />
          </Field>
        </Group>
        <p className="pf-summary">{summary.join(" · ")}</p>
      </div>
      <Footer>
        <FooterButton onClick={addShot}>
          <Plus size={12} strokeWidth={2} /> Shot
        </FooterButton>
        <FooterButton onClick={() => commands.duplicateSelection()}>Duplicate</FooterButton>
        <FooterButton danger onClick={() => void deleteScene()}>
          Delete scene
        </FooterButton>
      </Footer>
    </>
  );
}
