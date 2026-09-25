export const LINE_LABEL_FIELD_IDS = [
  "shotNumber",
  "shotType",
  "subject",
  "additionalInfo",
  "cameraSupport",
  "lens",
  "audio",
  "location",
  "scheduledDate",
  "notes",
  "indicator",
  "timeOfDay",
  "camera",
  "fps",
  "sync",
] as const;

export type LineLabelFieldId = (typeof LINE_LABEL_FIELD_IDS)[number];

export type LineLabelField = {
  id: LineLabelFieldId;
  enabled: boolean;
};

export const LINE_LABEL_FIELD_LABELS: Record<LineLabelFieldId, string> = {
  shotNumber: "Shot number",
  shotType: "Shot type",
  subject: "Subject",
  additionalInfo: "Additional info",
  cameraSupport: "System/Movement",
  lens: "Lens",
  audio: "Audio",
  location: "Location",
  scheduledDate: "Scheduled date",
  notes: "Notes",
  indicator: "Indicator",
  timeOfDay: "Time",
  camera: "Camera",
  fps: "FPS",
  sync: "Sync",
};

export const DEFAULT_LINE_LABEL_FIELDS: LineLabelField[] = [
  { id: "shotNumber", enabled: true },
  { id: "shotType", enabled: true },
  { id: "subject", enabled: true },
  { id: "additionalInfo", enabled: true },
  { id: "cameraSupport", enabled: false },
  { id: "lens", enabled: false },
  { id: "audio", enabled: false },
  { id: "location", enabled: false },
  { id: "scheduledDate", enabled: false },
  { id: "notes", enabled: false },
  { id: "indicator", enabled: false },
  { id: "timeOfDay", enabled: false },
  { id: "camera", enabled: false },
  { id: "fps", enabled: false },
  { id: "sync", enabled: false },
];

export const DEFAULT_SCHEDULED_DATE_FORMAT = "dddd, mmmm d";

const FIELD_ID_SET = new Set<string>(LINE_LABEL_FIELD_IDS);

export function isLineLabelFieldId(value: unknown): value is LineLabelFieldId {
  return typeof value === "string" && FIELD_ID_SET.has(value);
}

export function migrateLineLabelFields(raw: unknown): LineLabelField[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_LINE_LABEL_FIELDS.map((field) => ({ ...field }));
  }
  const result: LineLabelField[] = [];
  const seen = new Set<LineLabelFieldId>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (!isLineLabelFieldId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, enabled: (item as { enabled?: unknown }).enabled === true });
  }
  for (const field of DEFAULT_LINE_LABEL_FIELDS) {
    if (!seen.has(field.id)) result.push({ ...field });
  }
  return result;
}
