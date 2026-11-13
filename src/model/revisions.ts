/*
 * Script revisions (optional, off by default). Rewritten pages go out on
 * colored paper in a fixed order: white, blue, pink, yellow… While tracking is
 * on, a shot that is added or changed, or whose lines, notes or shapes change,
 * is tagged with the current revision, so it is easy to see what to re-check.
 */
import type { Project, Shot } from "./types";

export const REVISION_COLORS = [
  { key: "white", label: "White", color: "#F5F5F5" },
  { key: "blue", label: "Blue", color: "#64B5F6" },
  { key: "pink", label: "Pink", color: "#F48FB1" },
  { key: "yellow", label: "Yellow", color: "#FFF176" },
  { key: "green", label: "Green", color: "#81C784" },
  { key: "goldenrod", label: "Goldenrod", color: "#DAA520" },
  { key: "buff", label: "Buff", color: "#F0DC82" },
  { key: "salmon", label: "Salmon", color: "#FA8072" },
  { key: "cherry", label: "Cherry", color: "#D2042D" },
  { key: "double-white", label: "Double White", color: "#FFFFFF" },
  { key: "double-blue", label: "Double Blue", color: "#1E88E5" },
  { key: "double-pink", label: "Double Pink", color: "#EC407A" },
] as const;

export const revisionLabel = (key: string | undefined) => REVISION_COLORS.find((r) => r.key === key)?.label ?? key ?? "";
export const revisionColor = (key: string | undefined) => REVISION_COLORS.find((r) => r.key === key)?.color ?? "#999999";

/** Changes to these alone don't count as a revision (numbering, hiding, the tag itself). */
const IGNORED = new Set(["number", "visible", "locked", "revision"]);
const content = (value: object) => JSON.stringify(Object.entries(value).filter(([k]) => !IGNORED.has(k)));

/**
 * Tags shots that changed between two versions of the project with the
 * current revision. Returns `next` unchanged when tracking is off or nothing
 * needs a tag.
 */
export function stampRevisions(prev: Project, next: Project): Project {
  const tracking = next.settings.revisions;
  if (!tracking?.enabled || prev === next) return next;
  const current = tracking.current;

  const touched = new Set<string>();
  // Marks added, changed or removed: their shots count as changed.
  if (prev.marks !== next.marks) {
    const before = new Map(prev.marks.map((m) => [m.id, m]));
    const after = new Set<string>();
    for (const mark of next.marks) {
      after.add(mark.id);
      const old = before.get(mark.id);
      if (old === mark || mark.kind === "image") continue;
      const shotId = mark.shotId ?? (old && old.kind !== "image" ? old.shotId : undefined);
      if (shotId && (!old || content(old) !== content(mark))) touched.add(shotId);
      if (old && old.kind !== "image" && old.shotId && old.shotId !== mark.shotId) touched.add(old.shotId);
    }
    for (const old of prev.marks) if (!after.has(old.id) && old.kind !== "image" && old.shotId) touched.add(old.shotId);
  }
  if (prev.scenes !== next.scenes) {
    const before = new Map<string, Shot>();
    for (const scene of prev.scenes) for (const shot of scene.shots) before.set(shot.id, shot);
    for (const scene of next.scenes) {
      for (const shot of scene.shots) {
        const old = before.get(shot.id);
        if (old !== shot && (!old || content(old) !== content(shot))) touched.add(shot.id);
      }
    }
  }
  let stamped = false;
  const scenes = next.scenes.map((scene) => {
    if (!scene.shots.some((s) => touched.has(s.id) && s.revision !== current)) return scene;
    stamped = true;
    return { ...scene, shots: scene.shots.map((s) => (touched.has(s.id) && s.revision !== current ? { ...s, revision: current } : s)) };
  });
  return stamped ? { ...next, scenes } : next;
}

/** Removes every revision tag. */
export function clearRevisionTags(project: Project): Project {
  if (!project.scenes.some((scene) => scene.shots.some((s) => s.revision !== undefined))) return project;
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({ ...scene, shots: scene.shots.map(({ revision: _gone, ...rest }) => rest) })),
  };
}
