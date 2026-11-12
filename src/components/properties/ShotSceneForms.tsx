import { Plus, X } from "lucide-react";
import * as commands from "../../commands";
import { captionFieldText, printsField, shotCaption, withPrintField } from "../../model/captions";
import { createShot } from "../../model/defaults";
import * as edits from "../../model/edits";
import { describeLength, formatEighths, formatPageRange, sceneLength, shotLength } from "../../model/pageLength";
import { choiceEntries, choiceLabel, keyForText } from "../../model/registry";
import type { CameraRow, Project, Scene, Shot, ShotOwn } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { Chips, ColorField, Field, Footer, FooterButton, Group, Lockable, LockButton, NumberInput, Select, TextInput } from "./parts";

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

function CameraRows({ cameras, disabled, onChange }: { cameras: CameraRow[]; disabled?: boolean; onChange: (cameras: CameraRow[]) => void }) {
  const setRow = (index: number, patch: Partial<CameraRow>) =>
    onChange(cameras.map((camera, i) => (i === index ? { ...camera, ...patch } : camera)));
  return (
    <div className="pf-cameras">
      {cameras.map((camera, index) => (
        <div className="pf-camera" key={index}>
          <input
            className="pf-input pf-camera-name"
            aria-label={`Camera ${index + 1} name`}
            placeholder="Cam"
            value={camera.name}
            disabled={disabled}
            onChange={(e) => setRow(index, { name: e.target.value })}
          />
          <Chips
            values={camera.lenses}
            label={`Lenses of camera ${camera.name || index + 1}`}
            placeholder="Lens…"
            disabled={disabled}
            onChange={(lenses) => setRow(index, { lenses })}
          />
          {!disabled && (
            <button type="button" className="pf-icon-btn" title="Remove camera" aria-label={`Remove camera ${camera.name || index + 1}`} onClick={() => onChange(cameras.filter((_, i) => i !== index))}>
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
};

export function ShotInspector({ project, found, asTab }: ShotInspectorProps) {
  const { scene, shot, sceneIndex } = found;
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
  const print = (fieldId: string) => ({
    print: printsField(project, shot, fieldId),
    onPrintChange: (on: boolean) => apply(edits.updateShot(shot.id, (current) => withPrintField(project, current, fieldId, on))),
  });
  const setOwn = <K extends keyof ShotOwn>(field: K, value: ShotOwn[K] | undefined) => apply(edits.setShotOwn(shot.id, field, value));

  /** Lock state and toggle for one inheritable field. Unlocking starts from the scene's value. */
  const lock = <K extends keyof ShotOwn>(field: K, sceneValue: NonNullable<ShotOwn[K]> | undefined, empty: NonNullable<ShotOwn[K]>) => {
    const locked = own[field] === undefined;
    return {
      locked,
      what: `scene ${sceneIndex + 1}`,
      onToggle: () => {
        breakUndoGroup();
        setOwn(field, locked ? structuredClone(sceneValue ?? empty) : undefined);
        breakUndoGroup();
      },
    };
  };
  /** A text field left empty goes back to following the scene. */
  const relockIfEmpty = (field: "indicator" | "location" | "time" | "fps" | "date") => (value: string) => {
    if (value.trim() === "" && own[field] !== undefined) setOwn(field, undefined);
  };

  const lockedText = (field: "indicator" | "location" | "time" | "fps", label: string, sceneValue: string, suggestions?: string[]) => {
    const l = lock(field, sceneValue, "");
    return (
      <Lockable {...l}>
        <TextInput
          label={label}
          value={l.locked ? sceneValue : (own[field] ?? "")}
          placeholder={sceneValue}
          disabled={l.locked}
          suggestions={suggestions}
          onChange={(value) => setOwn(field, value)}
          onBlur={relockIfEmpty(field)}
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
    patch({ tags: [...new Set(keys)] });
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

  const movement = lock("movement", scene.defaults.movement, []);
  const cameras = lock("cameras", scene.defaults.cameras, []);
  const audio = lock("audio", scene.defaults.audio, []);
  const sync = lock("sync", scene.defaults.sync, "");
  const date = lock("date", scene.defaults.date, "");

  return (
    <>
      <div className="pf-scroll">
        <div className="pf-shot-top">
          <ColorField color={shot.color} label={`Color of shot ${id}`} onChange={(color) => patch({ color })} />
          <label className="pf-caption-preview" style={{ color: shot.color }} title="The caption drawn on this shot's lines">
            <input type="checkbox" checked={print("shotNumber").print} aria-label="Print the shot number in the caption" onChange={(e) => print("shotNumber").onPrintChange(e.target.checked)} />
            {shotCaption(project, found) || id}
          </label>
        </div>

        <Group name="shot" title="Shot">
          <Field label="Shot type" {...print("type")}>
            <TextInput label="Shot type" value={shot.type ?? ""} placeholder="WS, MS, CU…" onChange={(type) => patch({ type })} />
          </Field>
          <Field label="Angle" {...print("angle")}>
            <TextInput
              label="Angle"
              value={choiceLabel("angle", shot.angle, lists)}
              suggestions={choiceEntries("angle", lists).map((e) => e.label)}
              onChange={(text) => patch({ angle: keyForText("angle", text, lists) })}
            />
          </Field>
          <Field label="Subject" wide {...print("subject")}>
            <TextInput label="Subject" value={shot.subject ?? ""} onChange={(subject) => patch({ subject })} />
          </Field>
          <Field label="Cast" wide {...print("cast")}>
            <Chips values={shot.cast ?? []} label="Add cast" onChange={(cast) => patch({ cast })} />
          </Field>
          <Field label="Tags" wide {...print("tags")}>
            <Chips values={shot.tags ?? []} label="Add tag" display={tagLabel} suggestions={(lists.tags ?? []).map((t) => t.label)} onChange={setTags} />
          </Field>
          <Field label="Additional info" wide {...print("additionalInfo")}>
            <TextInput label="Additional info" value={shot.additionalInfo ?? ""} onChange={(additionalInfo) => patch({ additionalInfo })} />
          </Field>
        </Group>

        <Group name="shot-scene" title="Scene" note={`from scene ${sceneIndex + 1}`}>
          <div className="pf-three pf-wide">
            <Field label="Indicator" {...print("indicator")}>
              {lockedText("indicator", "Indicator", scene.heading.indicator, INDICATORS)}
            </Field>
            <Field label="Location" {...print("location")}>
              {lockedText("location", "Location", scene.heading.location)}
            </Field>
            <Field label="Time" {...print("time")}>
              {lockedText("time", "Time", scene.heading.time, TIMES)}
            </Field>
          </div>
        </Group>

        <Group name="shot-camera" title="Camera & Sound">
          <Field label="System/Movement" wide {...print("movement")}>
            <Lockable {...movement}>
              <Chips values={own.movement ?? scene.defaults.movement} label="Add system or movement" disabled={movement.locked} onChange={(v) => setOwn("movement", v)} />
            </Lockable>
          </Field>
          <div className="pf-field pf-wide">
            <span className="pf-label">
              <input type="checkbox" checked={print("camera").print} aria-label="Print camera in the caption" title="Print camera in the caption" onChange={(e) => print("camera").onPrintChange(e.target.checked)} />
              Camera
              <input type="checkbox" className="pf-second-check" checked={print("lens").print} aria-label="Print lens in the caption" title="Print lens in the caption" onChange={(e) => print("lens").onPrintChange(e.target.checked)} />
              Lens
              <span className="pf-label-end">
                <LockButton {...cameras} />
              </span>
            </span>
            <CameraRows cameras={own.cameras ?? scene.defaults.cameras} disabled={cameras.locked} onChange={(v) => setOwn("cameras", v)} />
          </div>
          <Field label="Audio" wide {...print("audio")}>
            <Lockable {...audio}>
              <Chips values={own.audio ?? scene.defaults.audio} label="Add audio" disabled={audio.locked} onChange={(v) => setOwn("audio", v)} />
            </Lockable>
          </Field>
          <Field label="FPS" {...print("fps")}>
            {lockedText("fps", "FPS", scene.defaults.fps ?? "")}
          </Field>
          <Field label="Sync" {...print("sync")}>
            <Lockable {...sync}>
              <Select label="Sync" value={own.sync ?? scene.defaults.sync ?? ""} options={syncOptions(project)} disabled={sync.locked} onChange={(v) => setOwn("sync", v)} />
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
            <TextInput label="Setup" value={shot.setup ?? ""} onChange={(setup) => patch({ setup })} />
          </Field>
          <Field label="Est. time">
            <NumberInput label="Estimated time in minutes" value={shot.estimatedMinutes} min={0} max={9999} unit="min" allowEmpty onChange={(estimatedMinutes) => patch({ estimatedMinutes })} />
          </Field>
          <Field label="Scheduled date" wide {...print("date")}>
            <Lockable {...date}>
              <TextInput type="date" label="Scheduled date" value={own.date ?? scene.defaults.date ?? ""} disabled={date.locked} onChange={(v) => setOwn("date", v)} onBlur={relockIfEmpty("date")} />
            </Lockable>
          </Field>
          <Field label="Notes" wide {...print("notes")}>
            <TextInput multiline label="Notes" value={shot.notes ?? ""} onChange={(notes) => patch({ notes })} />
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
  const number = sceneIndex + 1;
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
          <Field label="System/Movement" wide hint="Shots in this scene use these values until they set their own.">
            <Chips values={scene.defaults.movement} label="Add system or movement" onChange={(movement) => defaults({ movement })} />
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
        <FooterButton danger onClick={() => void deleteScene()}>
          Delete scene
        </FooterButton>
      </Footer>
    </>
  );
}
