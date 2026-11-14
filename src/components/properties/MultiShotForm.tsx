/*
 * Several shots selected in the Scenes list (Ctrl- or Shift-click): change
 * status, priority, scheduled date, shot type or visibility for all of them at once.
 */
import * as commands from "../../commands";
import { effectiveShot } from "../../model/captions";
import * as edits from "../../model/edits";
import { choiceEntries } from "../../model/registry";
import type { Project, Shot } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { Field, Footer, FooterButton, Group, Select } from "./parts";

const MIXED = "\u0000mixed";

/** One undo step that changes every selected shot. */
function updateAll(ids: string[], recipe: (shot: Shot) => Shot): void {
  breakUndoGroup();
  useProjectStore.getState().apply((project) => ids.reduce((p, id) => edits.updateShot(id, recipe)(p), project));
  breakUndoGroup();
}

export function MultiShotInspector({ project, ids }: { project: Project; ids: string[] }) {
  const found = ids.map((id) => edits.findShot(project, id)).filter((f): f is edits.FoundShot => !!f);
  const lists = project.settings.lists;
  /** The value every shot shares, or MIXED. */
  const shared = (value: (f: edits.FoundShot) => string) => {
    const values = new Set(found.map(value));
    return values.size === 1 ? [...values][0]! : MIXED;
  };
  const withMixed = (value: string, options: { value: string; label: string }[]) =>
    value === MIXED ? [{ value: MIXED, label: "Mixed" }, ...options] : options;

  const status = shared((f) => f.shot.status);
  const priority = shared((f) => f.shot.priority);
  const date = shared((f) => effectiveShot(f.scene, f.shot).date ?? "");
  const type = shared((f) => f.shot.type ?? "");
  const hidden = found.filter((f) => !f.shot.visible).length;

  return (
    <>
      <div className="pf-scroll">
        <p className="pf-empty">
          {found.length} shots selected. Changes here apply to all of them; the color bar recolors them all. Ctrl-click adds or removes a shot, Shift-click selects a run.
        </p>
        <Group name="multi-shot" title="All selected shots">
          <Field label="Status">
            <Select
              label="Status of all"
              value={status}
              options={withMixed(status, choiceEntries("status", lists).map((e) => ({ value: e.key, label: e.label })))}
              onChange={(value) => value !== MIXED && updateAll(ids, (shot) => ({ ...shot, status: value }))}
            />
          </Field>
          <Field label="Priority">
            <Select
              label="Priority of all"
              value={priority}
              options={withMixed(priority, choiceEntries("priority", lists).map((e) => ({ value: e.key, label: e.label })))}
              onChange={(value) => value !== MIXED && updateAll(ids, (shot) => ({ ...shot, priority: value }))}
            />
          </Field>
          <Field label="Scheduled date" hint="Sets each shot's own date. Clear it to follow the scene again.">
            <input
              className="pf-input"
              type="date"
              aria-label="Scheduled date of all"
              value={date === MIXED ? "" : date}
              onChange={(e) => {
                const value = e.target.value;
                updateAll(ids, (shot) => {
                  const own = { ...shot.own };
                  if (value) own.date = value;
                  else delete own.date;
                  const next: Shot = { ...shot, own };
                  if (Object.keys(own).length === 0) delete next.own;
                  return next;
                });
              }}
            />
          </Field>
          <Field label="Shot type">
            <input
              className="pf-input"
              aria-label="Shot type of all"
              placeholder={type === MIXED ? "Mixed" : "WS, MS, CU…"}
              defaultValue={type === MIXED ? "" : type}
              key={type}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value === (type === MIXED ? "" : type)) return;
                updateAll(ids, (shot) => {
                  const next: Shot = { ...shot, type: value };
                  if (!value) delete next.type;
                  return next;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </Field>
          <Field label="On the script" wide>
            <div className="pf-row-buttons">
              <button type="button" className="pf-btn" disabled={hidden === 0} onClick={() => updateAll(ids, (shot) => ({ ...shot, visible: true }))}>
                Show all
              </button>
              <button type="button" className="pf-btn" disabled={hidden === found.length} onClick={() => updateAll(ids, (shot) => ({ ...shot, visible: false }))}>
                Hide all
              </button>
            </div>
          </Field>
        </Group>
      </div>
      <Footer>
        <FooterButton danger onClick={() => commands.deleteSelection()}>
          Delete {found.length} shots
        </FooterButton>
      </Footer>
    </>
  );
}
