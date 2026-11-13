import { DATA_REVISION } from "../model/defaults";
import type { Project } from "../model/types";

/**
 * Serializes a project as version 2 JSON. The key order is fixed so that two
 * saves of the same project differ only where the project does.
 */
export function serializeProject(project: Project, now: Date = new Date()): string {
  const out: Project = {
    version: 2,
    dataRevision: DATA_REVISION,
    savedAt: now.toISOString(),
    appVersion: __APP_VERSION__,
    name: project.name,
    ...(project.script ? { script: project.script } : {}),
    settings: project.settings,
    scenes: project.scenes,
    marks: project.marks,
    assets: project.assets,
    ...(project.unplacedV1Marks?.length ? { unplacedV1Marks: project.unplacedV1Marks } : {}),
    ...(project.view ? { view: project.view } : {}),
  };
  return JSON.stringify(out, null, 2);
}

/** File-safe stem built from the project name. */
export function projectFileStem(project: Pick<Project, "name">): string {
  return project.name.replace(/[^\w.-]+/g, "_") || "project";
}
