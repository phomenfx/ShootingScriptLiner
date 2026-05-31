import { getLineFontFamily } from "./annotationUtils";
import type { Project } from "../types/project";

/** Distinct CSS font-family values used by a project (defaults, lines, text). */
export function collectProjectFontFamilies(project: Project): string[] {
  const families = new Set<string>();
  families.add(project.defaultLine.fontFamily);
  for (const ann of project.annotations) {
    if (ann.kind === "line") {
      families.add(getLineFontFamily(ann, project));
    } else if (ann.kind === "text") {
      families.add(ann.fontFamily ?? project.defaultLine.fontFamily);
    }
  }
  return [...families];
}
