import { X } from "lucide-react";
import * as commands from "../../commands";
import { shotName } from "../../model/captions";
import * as edits from "../../model/edits";
import { listScenes } from "../../model/shotList";
import type { Project } from "../../model/types";
import { Field, Footer, FooterButton, Group, Select } from "./parts";

const NAMES: Record<string, [string, string]> = {
  line: ["line", "lines"],
  text: ["note", "notes"],
  shape: ["shape", "shapes"],
  image: ["image", "images"],
};

/** Several marks selected: a count, a shared shot link, and actions for all of them. */
export function MultiMarkInspector({ project, ids }: { project: Project; ids: string[] }) {
  const marks = ids.map((id) => edits.findMark(project, id)).filter((m): m is NonNullable<typeof m> => !!m);
  const counts = new Map<string, number>();
  for (const mark of marks) counts.set(mark.kind, (counts.get(mark.kind) ?? 0) + 1);
  const summary = [...counts].map(([kind, n]) => `${n} ${NAMES[kind]![n === 1 ? 0 : 1]}`).join(", ");
  const shotIds = new Set(marks.map((m) => edits.markShotId(m) ?? ""));
  // One shared link shows in the picker; mixed links show as "Several".
  const shared = shotIds.size === 1 ? [...shotIds][0]! : "mixed";
  const options = [
    ...(shared === "mixed" ? [{ value: "mixed", label: "Several shots" }] : []),
    { value: "", label: "Not linked" },
    ...listScenes(project).flatMap((l) =>
      l.shots.map((item) => ({
        value: item.shot.id,
        label: shotName(project, { scene: l.scene, shot: item.shot, sceneIndex: l.sceneIndex, shotIndex: item.shotIndex }),
      }))
    ),
  ];
  return (
    <>
      <div className="pf-scroll">
        <p className="pf-empty">
          {marks.length} marks selected: {summary}. Drag any of them to move them together; the color bar recolors them all.
        </p>
        <Group name="multi-link" title="Link">
          <div className="pf-wide pf-link">
            <Select
              label="Link all to shot"
              value={shared}
              options={options}
              onChange={(shotId) => shotId !== "mixed" && commands.linkMarksToShot(ids, shotId)}
            />
            {shared !== "" && (
              <button type="button" className="pf-icon-btn" title="Unlink all" aria-label="Unlink all from their shots" onClick={() => commands.linkMarksToShot(ids, "")}>
                <X size={13} strokeWidth={1.75} />
              </button>
            )}
          </div>
          <Field label="Hide" wide>
            <span className="pf-none">Ctrl+H hides the shots of every selected mark.</span>
          </Field>
        </Group>
      </div>
      <Footer>
        <FooterButton onClick={commands.duplicateSelection}>Duplicate all</FooterButton>
        <FooterButton danger onClick={commands.deleteSelection}>
          Delete all
        </FooterButton>
      </Footer>
    </>
  );
}
