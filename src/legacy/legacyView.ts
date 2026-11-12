/**
 * Temporary bridge for the rework. The stores hold version 2 data; the screens
 * that have not been rebuilt yet still expect the version 1 shapes in
 * `src/types`. This file shows version 2 data in those old shapes, and turns
 * old-shape edits back into version 2.
 *
 * Each rebuilt screen reads the stores directly, so this file shrinks as the
 * rework goes and is deleted with the last old screen.
 */
import { composeSlugline } from "../lib/slugline";
import {
  FALLBACK_PAGE,
  V1_CAPTION_FIELD_IDS,
  camerasFromV1,
  endingFromV1,
  lineFromV1,
  patternFromV1,
  syncKeyFromV1,
  textFromV1,
  v1MarkContext,
} from "../io/migrateV1";
import { shotCaption } from "../model/captions";
import { choiceLabel } from "../model/registry";
import { findShot } from "../model/edits";
import type * as V2 from "../model/types";
import type {
  LineAnnotation,
  LineCap,
  LineEnding,
  LineStroke,
  TextAnnotation,
} from "../types/annotations";
import type { LineDefaults } from "../types/lineDefaults";
import type { LineLabelField, LineLabelFieldId } from "../types/lineLabelFields";
import type { Annotation, Project, Scene, Shot } from "../types/project";

/** Endings the page and PDF drawing understand. */
const V1_CAPS = ["none", "square", "circle", "diamond", "arrow", "arrowReversed", "butt", "slash", "bracket", "doubleArrow", "dot"];
const V2_CAPTION_FIELD_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(V1_CAPTION_FIELD_IDS).map(([v1, v2]) => [v2, v1])
);

/* ---------- version 2 → old shapes ---------- */

function legacyStroke(pattern: string): LineStroke {
  if (pattern === "straight") return "solid";
  return patternFromV1(pattern) === pattern ? (pattern as LineStroke) : "solid";
}

export function legacyEnding(ending: V2.Ending): LineEnding {
  return {
    cap: (V1_CAPS.includes(ending.type) ? ending.type : "none") as LineCap,
    scalePercent: ending.sizePct,
    filled: ending.filled,
  };
}

function pageSize(project: V2.Project, page: number): V2.ScriptPage {
  const pages = project.script?.pages ?? [];
  return pages[page - 1] ?? pages[0] ?? FALLBACK_PAGE;
}

export function legacyLine(
  mark: V2.LineMark,
  project: V2.Project,
  shotTypeUnlocked = false
): LineAnnotation {
  const size = pageSize(project, mark.page);
  const linked = findShot(project, mark.shotId);
  const c = mark.caption;
  const line: LineAnnotation = {
    id: mark.id,
    kind: "line",
    page: mark.page,
    points: mark.points.map((point) => ({ x: point.x / size.widthPt, y: point.y / size.heightPt })),
    style: {
      stroke: legacyStroke(mark.stroke.pattern),
      widthPt: mark.stroke.widthPt,
      color: mark.color ?? linked?.shot.color ?? "#FF0000",
      start: legacyEnding(mark.start),
      end: legacyEnding(mark.end),
    },
    fontFamily: c.font,
    fontSizePt: c.sizePt,
    labelBold: c.bold,
    shotId: linked ? mark.shotId : undefined,
    label: c.text,
    displayLabel:
      c.text === undefined && linked && mark.own && Object.keys(mark.own).length > 0
        ? shotCaption(project, linked, mark.own)
        : undefined,
    showLabel: c.show,
    locks: linked
      ? {
          shotId: true,
          shotType: !shotTypeUnlocked,
          label: c.text === undefined,
          color: mark.color === undefined,
        }
      : { shotId: false, shotType: false, label: false, color: false },
  };
  if (c.italic) line.labelItalic = true;
  if (c.underline) line.labelUnderline = true;
  if (c.offset) {
    line.labelOffsetXPt = c.offset.x;
    line.labelOffsetYPt = 0 - c.offset.y;
  }
  if (c.widthPt !== undefined) line.labelWidthPt = c.widthPt;
  if (c.minHeightPt !== undefined) line.labelMinHeightPt = c.minHeightPt;
  if (c.align !== "left") line.labelAlign = c.align;
  const cont = mark.contCaption;
  if (cont?.offsetXPt !== undefined) line.secondaryOffsetXPt = cont.offsetXPt;
  if (cont?.gapPt !== undefined) line.secondaryGapPt = cont.gapPt;
  if (cont?.widthPt !== undefined) line.secondaryWidthPt = cont.widthPt;
  if (cont?.minHeightPt !== undefined) line.secondaryMinHeightPt = cont.minHeightPt;
  if (cont?.align) line.secondaryAlign = cont.align;
  if (mark.marginContinuation) line.marginContinuation = mark.marginContinuation;
  return line;
}

export function legacyText(mark: V2.TextMark, project: V2.Project): TextAnnotation {
  const size = pageSize(project, mark.page);
  const linked = findShot(project, mark.shotId);
  const text: TextAnnotation = {
    id: mark.id,
    kind: "text",
    page: mark.page,
    x: mark.x / size.widthPt,
    y: mark.y / size.heightPt,
    text: mark.text ?? "",
    color: mark.color ?? linked?.shot.color ?? "#111111",
    fontSize: mark.style.sizePt,
    fontFamily: mark.style.font,
    labelBold: mark.style.bold,
  };
  if (mark.style.italic) text.labelItalic = true;
  if (mark.style.underline) text.labelUnderline = true;
  if (mark.style.align !== "left") text.align = mark.style.align;
  if (mark.widthPt !== undefined) text.widthPt = mark.widthPt;
  if (mark.minHeightPt !== undefined) text.minHeightPt = mark.minHeightPt;
  if (!mark.show) text.showText = false;
  if (linked) {
    text.shotId = mark.shotId;
    text.followShot = mark.text === undefined;
    text.locks = { shotId: true, color: mark.color === undefined };
    if (mark.text === undefined && mark.own && Object.keys(mark.own).length > 0) {
      text.displayLabel = shotCaption(project, linked, mark.own);
    }
  }
  return text;
}

function joined(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}

function cameraNames(cameras: V2.CameraRow[] | undefined): string {
  return joined(cameras?.map((camera) => camera.name).filter(Boolean));
}

function cameraLenses(cameras: V2.CameraRow[] | undefined): string {
  return joined(cameras?.flatMap((camera) => camera.lenses));
}

function compact<T extends object>(object: T): T {
  for (const key of Object.keys(object) as (keyof T)[]) {
    if (object[key] === undefined || object[key] === "") delete object[key];
  }
  return object;
}

export function legacyShot(shot: V2.Shot, scene: V2.Scene, order: number): Shot {
  const own = shot.own ?? {};
  // Version 1 let camera and lens inherit separately. A half that still
  // matches the scene is shown as blank, as it was before.
  const camera = own.cameras ? cameraNames(own.cameras) : "";
  const lens = own.cameras ? cameraLenses(own.cameras) : "";
  const result: Shot = {
    id: shot.id,
    order,
    color: shot.color,
    visible: shot.visible,
    ...compact({
      shotType: shot.type,
      subject: shot.subject,
      slug: shot.additionalInfo,
      notes: shot.notes,
      cameraSupport: own.movement ? joined(own.movement) : "",
      lens: lens === cameraLenses(scene.defaults.cameras) ? "" : lens,
      audioSource: own.audio ? joined(own.audio) : "",
      indicator: own.indicator,
      location: own.location,
      timeOfDay: own.time,
      camera: camera === cameraNames(scene.defaults.cameras) ? "" : camera,
      fps: own.fps,
      sync: choiceLabel("sync", own.sync),
      scheduledDate: own.date,
    }),
  };
  if (shot.print) {
    const include: Partial<Record<LineLabelFieldId, boolean>> = {};
    for (const [id, value] of Object.entries(shot.print)) {
      const v1Id = V2_CAPTION_FIELD_IDS[id];
      if (v1Id) include[v1Id as LineLabelFieldId] = value;
    }
    if (Object.keys(include).length > 0) result.lineLabelInclude = include;
  }
  return result;
}

/** With `project`, each shot also carries its finished caption, new fields included. */
export function legacyScene(scene: V2.Scene, order: number, project?: V2.Project): Scene {
  const { indicator, location, time } = scene.heading;
  return {
    id: scene.id,
    slugline: composeSlugline(indicator, location, time),
    order,
    visible: scene.visible,
    shots: scene.shots.map((shot, index) => {
      const out = legacyShot(shot, scene, index);
      if (project) {
        out.captionText = shotCaption(project, { scene, shot, sceneIndex: order, shotIndex: index });
      }
      return out;
    }),
    ...compact({
      indicator,
      location,
      timeOfDay: time,
      cameraSupport: joined(scene.defaults.movement),
      lens: cameraLenses(scene.defaults.cameras),
      audioSource: joined(scene.defaults.audio),
      camera: cameraNames(scene.defaults.cameras),
      fps: scene.defaults.fps,
      sync: choiceLabel("sync", scene.defaults.sync),
      scheduledDate: scene.defaults.date,
    }),
  };
}

function legacyDefaultLine(d: V2.LineDefaults): LineDefaults {
  return {
    stroke: legacyStroke(d.stroke.pattern),
    widthPt: d.stroke.widthPt,
    fontFamily: d.caption.font,
    fontSizePt: d.caption.sizePt,
    labelBold: d.caption.bold,
    start: legacyEnding(d.start),
    end: legacyEnding(d.end),
  };
}

function legacyLabelFields(fields: V2.CaptionField[]): LineLabelField[] {
  const result: LineLabelField[] = [];
  for (const field of fields) {
    const id = V2_CAPTION_FIELD_IDS[field.id];
    if (id) result.push({ id: id as LineLabelFieldId, enabled: field.print });
  }
  return result;
}

/* Caches keep unchanged scenes, marks and settings identical between views,
   so the old screens re-render only what changed. */
type SceneEntry = { order: number; settings: V2.ProjectSettings; out: Scene };
type MarkEntry = {
  size: V2.ScriptPage;
  shot: V2.Shot | undefined;
  unlocked: boolean;
  settings: V2.ProjectSettings;
  out: Annotation;
};
const sceneCache = new WeakMap<V2.Scene, SceneEntry>();
const markCache = new WeakMap<V2.Mark, MarkEntry>();
const defaultLineCache = new WeakMap<V2.LineDefaults, LineDefaults>();
const labelFieldsCache = new WeakMap<V2.CaptionField[], LineLabelField[]>();
let lastScenes: { from: V2.Scene[]; settings: V2.ProjectSettings; out: Scene[] } | null = null;

function cached<K extends object, V>(cache: WeakMap<K, V>, key: K, build: () => V): V {
  let value = cache.get(key);
  if (value === undefined) {
    value = build();
    cache.set(key, value);
  }
  return value;
}

/** The whole project in the old shape. Shapes and images have no old form and are left out. */
export function toLegacyProject(
  project: V2.Project,
  shotTypeUnlocked: ReadonlySet<string> = new Set()
): Project {
  const s = project.settings;

  let scenes: Scene[];
  if (lastScenes?.from === project.scenes && lastScenes.settings === s) {
    scenes = lastScenes.out;
  } else {
    scenes = project.scenes.map((scene, order) => {
      const hit = sceneCache.get(scene);
      if (hit && hit.order === order && hit.settings === s) return hit.out;
      const out = legacyScene(scene, order, project);
      sceneCache.set(scene, { order, settings: s, out });
      return out;
    });
    lastScenes = { from: project.scenes, settings: s, out: scenes };
  }

  const shotById = new Map<string, V2.Shot>();
  for (const scene of project.scenes) for (const shot of scene.shots) shotById.set(shot.id, shot);

  const annotations: Annotation[] = [];
  for (const mark of project.marks) {
    if (mark.kind !== "line" && mark.kind !== "text") continue;
    const size = pageSize(project, mark.page);
    const shot = mark.shotId ? shotById.get(mark.shotId) : undefined;
    const unlocked = shotTypeUnlocked.has(mark.id);
    const hit = markCache.get(mark);
    if (hit && hit.size === size && hit.shot === shot && hit.unlocked === unlocked && hit.settings === s) {
      annotations.push(hit.out);
      continue;
    }
    const out =
      mark.kind === "line" ? legacyLine(mark, project, unlocked) : legacyText(mark, project);
    markCache.set(mark, { size, shot, unlocked, settings: s, out });
    annotations.push(out);
  }

  return {
    version: 1,
    name: project.name,
    labelMode: s.general.shotIdStyle,
    additionalInfoStyle: s.general.additionalInfoStyle,
    defaultShotColor: s.general.newShotColor,
    snapAngleDegrees: s.drawing.angleSnapDegrees,
    inheritLineFromPrevious: s.drawing.newLineCopiesPrevious,
    labelOffsetXPt: s.captions.offsetAcrossPt,
    labelOffsetYPt: s.captions.offsetAbovePt,
    labelSecondaryGapPt: s.captions.contGapPt,
    defaultLine: cached(defaultLineCache, s.markDefaults.line, () =>
      legacyDefaultLine(s.markDefaults.line)
    ),
    lineLabelFields: cached(labelFieldsCache, s.captions.fields, () =>
      legacyLabelFields(s.captions.fields)
    ),
    scheduledDateFormat: s.captions.dateFormat,
    scriptFileName: project.script?.fileName,
    scenes,
    annotations,
  };
}

/* ---------- old shapes → version 2 ---------- */

/** Keeps a version 2 key the old screens cannot show (a new pattern or ending) unless they changed it. */
function keepUnlessChanged<T>(base: string | undefined, shown: (key: string) => T, next: T, fresh: string): string {
  return base !== undefined && shown(base) === next ? base : fresh;
}

/** An old-shape line as a version 2 mark. `base` is the mark it replaces, if any. */
export function lineToV2(line: LineAnnotation, project: V2.Project, base?: V2.LineMark): V2.LineMark {
  const raw = line as unknown as Record<string, unknown>;
  const mark = lineFromV1(raw, v1MarkContext(project, true));
  if (!mark) throw new Error("Line has no points");
  if (!base) return mark;

  mark.stroke.pattern = keepUnlessChanged(base.stroke.pattern, legacyStroke, line.style.stroke, mark.stroke.pattern);
  if (base.stroke.patternSizePct !== undefined) mark.stroke.patternSizePct = base.stroke.patternSizePct;
  if (base.stroke.lengthPct !== undefined) mark.stroke.lengthPct = base.stroke.lengthPct;
  if (base.stroke.gapPct !== undefined) mark.stroke.gapPct = base.stroke.gapPct;
  if (base.stroke.amplitudePct !== undefined) mark.stroke.amplitudePct = base.stroke.amplitudePct;
  if (base.stroke.waveSide !== undefined) mark.stroke.waveSide = base.stroke.waveSide;
  mark.start.type = keepUnlessChanged(base.start.type, (k) => legacyEnding({ ...base.start, type: k }).cap, line.style.start.cap, mark.start.type);
  mark.end.type = keepUnlessChanged(base.end.type, (k) => legacyEnding({ ...base.end, type: k }).cap, line.style.end.cap, mark.end.type);
  if (base.segments && base.segments.length === mark.points.length - 1) mark.segments = base.segments;
  if (base.mid) mark.mid = structuredClone(base.mid);
  if (base.outline) mark.outline = base.outline;
  if (base.caption.outline) mark.caption.outline = base.caption.outline;
  if (base.own) mark.own = structuredClone(base.own);
  return mark;
}

export function textToV2(text: TextAnnotation, project: V2.Project, base?: V2.TextMark): V2.TextMark {
  const mark = textFromV1(text as unknown as Record<string, unknown>, v1MarkContext(project, true));
  if (base?.outline) mark.outline = base.outline;
  if (base?.own) mark.own = structuredClone(base.own);
  return mark;
}

function list(value: string | undefined): string[] {
  const text = value?.trim() ?? "";
  return text ? [text] : [];
}

type ScenePatch = Partial<Omit<Scene, "id" | "order" | "shots">>;

/** Applies an old-shape scene patch. Only the patched fields are touched. */
export function applyLegacyScenePatch(scene: V2.Scene, patch: ScenePatch): V2.Scene {
  const next: V2.Scene = { ...scene, heading: { ...scene.heading }, defaults: { ...scene.defaults } };
  if ("visible" in patch && typeof patch.visible === "boolean") next.visible = patch.visible;
  if ("indicator" in patch) next.heading.indicator = patch.indicator ?? "";
  if ("location" in patch) next.heading.location = patch.location ?? "";
  if ("timeOfDay" in patch) next.heading.time = patch.timeOfDay ?? "";
  if ("cameraSupport" in patch) next.defaults.movement = list(patch.cameraSupport);
  if ("audioSource" in patch) next.defaults.audio = list(patch.audioSource);
  if ("camera" in patch || "lens" in patch) {
    const camera = "camera" in patch ? patch.camera : cameraNames(scene.defaults.cameras);
    const lens = "lens" in patch ? patch.lens : cameraLenses(scene.defaults.cameras);
    next.defaults.cameras = camerasFromV1(camera, lens);
  }
  const setOrClear = (key: "fps" | "sync" | "date", value: string | undefined) => {
    if (value) next.defaults[key] = value;
    else delete next.defaults[key];
  };
  if ("fps" in patch) setOrClear("fps", patch.fps?.trim());
  if ("sync" in patch) setOrClear("sync", syncKeyFromV1(patch.sync));
  if ("scheduledDate" in patch) setOrClear("date", patch.scheduledDate?.trim());
  return next;
}

type ShotPatch = Partial<Omit<Shot, "id" | "order">>;

/** Applies an old-shape shot patch. Only the patched fields are touched. */
export function applyLegacyShotPatch(shot: V2.Shot, scene: V2.Scene, patch: ShotPatch): V2.Shot {
  const next: V2.Shot = { ...shot };
  const own: V2.ShotOwn = { ...shot.own };
  const setText = (key: "type" | "subject" | "additionalInfo" | "notes", value: string | undefined) => {
    if (value) next[key] = value;
    else delete next[key];
  };
  const setOwn = <K extends keyof V2.ShotOwn>(key: K, value: V2.ShotOwn[K] | undefined) => {
    if (value === undefined) delete own[key];
    else own[key] = value;
  };
  const text = (value: string | undefined) => value?.trim() || undefined;

  if ("shotType" in patch) setText("type", patch.shotType);
  if ("subject" in patch) setText("subject", patch.subject);
  if ("slug" in patch) setText("additionalInfo", patch.slug);
  if ("notes" in patch) setText("notes", patch.notes);
  if ("color" in patch && patch.color) next.color = patch.color;
  if ("visible" in patch && typeof patch.visible === "boolean") next.visible = patch.visible;

  if ("indicator" in patch) setOwn("indicator", text(patch.indicator));
  if ("location" in patch) setOwn("location", text(patch.location));
  if ("timeOfDay" in patch) setOwn("time", text(patch.timeOfDay));
  if ("cameraSupport" in patch) setOwn("movement", text(patch.cameraSupport) ? list(patch.cameraSupport) : undefined);
  if ("audioSource" in patch) setOwn("audio", text(patch.audioSource) ? list(patch.audioSource) : undefined);
  if ("fps" in patch) setOwn("fps", text(patch.fps));
  if ("sync" in patch) setOwn("sync", syncKeyFromV1(patch.sync) || undefined);
  if ("scheduledDate" in patch) setOwn("date", text(patch.scheduledDate));
  if ("camera" in patch || "lens" in patch) {
    const shown = legacyShot(shot, scene, 0);
    const camera = text("camera" in patch ? patch.camera : shown.camera);
    const lens = text("lens" in patch ? patch.lens : shown.lens);
    if (!camera && !lens) {
      delete own.cameras;
    } else {
      const sceneCamera = scene.defaults.cameras[0];
      own.cameras = [
        {
          name: camera ?? sceneCamera?.name ?? "",
          lenses: lens ? [lens] : [...(sceneCamera?.lenses ?? [])],
        },
      ];
    }
  }
  if (Object.keys(own).length > 0) next.own = own;
  else delete next.own;

  if ("lineLabelInclude" in patch) {
    const print: Record<string, boolean> = {};
    for (const [v1Id, value] of Object.entries(patch.lineLabelInclude ?? {})) {
      const id = V1_CAPTION_FIELD_IDS[v1Id];
      if (id && typeof value === "boolean") print[id] = value;
    }
    if (Object.keys(print).length > 0) next.print = print;
    else delete next.print;
  }
  return next;
}

/** Applies an old-shape line defaults patch to the mark defaults. */
export function applyLegacyDefaultLinePatch(
  settings: V2.ProjectSettings,
  patch: Partial<LineDefaults>
): V2.ProjectSettings {
  const line = { ...settings.markDefaults.line };
  let text = settings.markDefaults.text;
  if (patch.stroke !== undefined) {
    line.stroke = {
      ...line.stroke,
      pattern: keepUnlessChanged(line.stroke.pattern, legacyStroke, patch.stroke, patternFromV1(patch.stroke)),
    };
  }
  if (patch.widthPt !== undefined) line.stroke = { ...line.stroke, widthPt: patch.widthPt };
  if (patch.start) line.start = endingFromV1(patch.start);
  if (patch.end) line.end = endingFromV1(patch.end);
  // Version 1 had one font setting for captions and notes alike.
  const style: Partial<V2.TextStyle> = {};
  if (patch.fontFamily !== undefined) style.font = patch.fontFamily;
  if (patch.fontSizePt !== undefined) style.sizePt = patch.fontSizePt;
  if (patch.labelBold !== undefined) style.bold = patch.labelBold;
  if (Object.keys(style).length > 0) {
    line.caption = { ...line.caption, ...style };
    text = { ...text, style: { ...text.style, ...style } };
  }
  return { ...settings, markDefaults: { ...settings.markDefaults, line, text } };
}

export { V2_CAPTION_FIELD_IDS };
