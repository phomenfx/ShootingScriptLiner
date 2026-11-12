import { getLineFontFamily } from "./annotationUtils";
import type { Project as V2Project } from "../model/types";
import type { Project } from "../types/project";

/** Fonts used by version 2 marks and the mark defaults. */
export function collectMarkFontFamilies(project: V2Project): string[] {
  const families = new Set<string>();
  families.add(project.settings.markDefaults.line.caption.font);
  families.add(project.settings.markDefaults.text.style.font);
  for (const mark of project.marks) {
    if (mark.kind === "line") families.add(mark.caption.font);
    else if (mark.kind === "text") families.add(mark.style.font);
  }
  return [...families];
}

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
