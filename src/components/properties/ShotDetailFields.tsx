import type { ReactNode } from "react";
import { formatExcelDate } from "../../lib/dateFormat";
import {
  formatLineCaption,
  lineLabelFieldEnabled,
  nextLineLabelInclude,
} from "../../lib/lineCaption";
import { useProjectStore } from "../../stores/projectStore";
import type { LineLabelFieldId } from "../../types/lineLabelFields";
import { SYNC_STATUSES, type Scene, type Shot } from "../../types/project";
import { SluglineFields, SLUGLINE_PLACEHOLDERS } from "../SluglineFields";

function inheritPlaceholder(sceneValue: string | undefined, fallback: string): string {
  const trimmed = sceneValue?.trim() ?? "";
  return trimmed || fallback;
}

export function SyncSelect({
  value,
  blankLabel,
  onChange,
}: {
  value: string;
  blankLabel: string;
  onChange: (value: string) => void;
}) {
  const known = value === "" || (SYNC_STATUSES as readonly string[]).includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blankLabel}</option>
      {!known && value ? <option value={value}>{value}</option> : null}
      {SYNC_STATUSES.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}

export const GEAR_PLACEHOLDERS = {
  cameraSupport: "Sticks, Handheld, Dolly, Steadicam...",
  lens: "35mm, 24-70…",
  audio: "Boom, Lav, ADR",
  camera: "ARRI Alexa 35, iPhone... // A, B, C...",
  fps: "24, 25, 30...",
} as const;

function IncludeField({
  checked,
  onToggle,
  label,
  span,
  children,
}: {
  checked: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`include-field ${span ? "span-2" : ""}`}>
      <label className="include-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        {label}
      </label>
      {children}
    </div>
  );
}

/** Shot caption fields, include checkboxes, and the slugline layout. */
export function ShotDetailFields({
  scene,
  shot,
  title,
}: {
  scene: Scene;
  shot: Shot;
  title?: string;
}) {
  const project = useProjectStore((s) => s.project);
  const updateShot = useProjectStore((s) => s.updateShot);

  const patch = (next: Parameters<typeof updateShot>[2]) => {
    updateShot(scene.id, shot.id, next);
  };

  const setInclude = (id: LineLabelFieldId, enabled: boolean) => {
    patch({ lineLabelInclude: nextLineLabelInclude(project, shot, id, enabled) });
  };

  return (
    <>
      <div className="shot-caption-row">
        <label className="field compact shot-color-field">
          Color
          <input
            type="color"
            value={shot.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        <div className="shot-caption-copy">
          {title ? <h4 className="props-section-title">{title}</h4> : null}
          <label className="shot-caption-check">
            <input
              type="checkbox"
              checked={lineLabelFieldEnabled(project, shot, "shotNumber")}
              onChange={(e) => setInclude("shotNumber", e.target.checked)}
            />
            <span className="shot-caption-text" style={{ color: shot.color }}>
              {formatLineCaption(scene, shot, project)}
            </span>
          </label>
        </div>
      </div>
      <div className="props-grid dense">
        <IncludeField
          label="Shot type"
          checked={lineLabelFieldEnabled(project, shot, "shotType")}
          onToggle={(enabled) => setInclude("shotType", enabled)}
        >
          <input
            type="text"
            placeholder="WS, MS, MCU…"
            value={shot.shotType ?? ""}
            onChange={(e) => patch({ shotType: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          label="Subject"
          checked={lineLabelFieldEnabled(project, shot, "subject")}
          onToggle={(enabled) => setInclude("subject", enabled)}
        >
          <input
            type="text"
            placeholder="Subject, Master…"
            value={shot.subject ?? ""}
            onChange={(e) => patch({ subject: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          span
          label="Additional info"
          checked={lineLabelFieldEnabled(project, shot, "additionalInfo")}
          onToggle={(enabled) => setInclude("additionalInfo", enabled)}
        >
          <input
            type="text"
            placeholder="Moving Master…"
            value={shot.slug ?? ""}
            onChange={(e) => patch({ slug: e.target.value })}
          />
        </IncludeField>
        <SluglineFields
          indicator={shot.indicator ?? ""}
          location={shot.location ?? ""}
          timeOfDay={shot.timeOfDay ?? ""}
          placeholders={{
            indicator: inheritPlaceholder(scene.indicator, SLUGLINE_PLACEHOLDERS.indicator),
            location: inheritPlaceholder(scene.location, SLUGLINE_PLACEHOLDERS.location),
            timeOfDay: inheritPlaceholder(scene.timeOfDay, SLUGLINE_PLACEHOLDERS.timeOfDay),
          }}
          checks={{
            indicator: {
              checked: lineLabelFieldEnabled(project, shot, "indicator"),
              onToggle: (enabled) => setInclude("indicator", enabled),
            },
            location: {
              checked: lineLabelFieldEnabled(project, shot, "location"),
              onToggle: (enabled) => setInclude("location", enabled),
            },
            timeOfDay: {
              checked: lineLabelFieldEnabled(project, shot, "timeOfDay"),
              onToggle: (enabled) => setInclude("timeOfDay", enabled),
            },
          }}
          onChange={(next) => patch(next)}
        />
        <p className="field-help span-2">Leave blank to use the scene.</p>
        <IncludeField
          span
          label="System/Movement"
          checked={lineLabelFieldEnabled(project, shot, "cameraSupport")}
          onToggle={(enabled) => setInclude("cameraSupport", enabled)}
        >
          <input
            type="text"
            placeholder={inheritPlaceholder(scene.cameraSupport, GEAR_PLACEHOLDERS.cameraSupport)}
            value={shot.cameraSupport ?? ""}
            onChange={(e) => patch({ cameraSupport: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          label="Lens"
          checked={lineLabelFieldEnabled(project, shot, "lens")}
          onToggle={(enabled) => setInclude("lens", enabled)}
        >
          <input
            type="text"
            placeholder={inheritPlaceholder(scene.lens, GEAR_PLACEHOLDERS.lens)}
            value={shot.lens ?? ""}
            onChange={(e) => patch({ lens: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          label="Audio"
          checked={lineLabelFieldEnabled(project, shot, "audio")}
          onToggle={(enabled) => setInclude("audio", enabled)}
        >
          <input
            type="text"
            placeholder={inheritPlaceholder(scene.audioSource, GEAR_PLACEHOLDERS.audio)}
            value={shot.audioSource ?? ""}
            onChange={(e) => patch({ audioSource: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          span
          label="Camera"
          checked={lineLabelFieldEnabled(project, shot, "camera")}
          onToggle={(enabled) => setInclude("camera", enabled)}
        >
          <input
            type="text"
            placeholder={inheritPlaceholder(scene.camera, GEAR_PLACEHOLDERS.camera)}
            value={shot.camera ?? ""}
            onChange={(e) => patch({ camera: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          label="FPS"
          checked={lineLabelFieldEnabled(project, shot, "fps")}
          onToggle={(enabled) => setInclude("fps", enabled)}
        >
          <input
            type="text"
            placeholder={inheritPlaceholder(scene.fps, GEAR_PLACEHOLDERS.fps)}
            value={shot.fps ?? ""}
            onChange={(e) => patch({ fps: e.target.value })}
          />
        </IncludeField>
        <IncludeField
          label="Sync"
          checked={lineLabelFieldEnabled(project, shot, "sync")}
          onToggle={(enabled) => setInclude("sync", enabled)}
        >
          <SyncSelect
            value={shot.sync ?? ""}
            blankLabel={
              scene.sync?.trim() ? `Use scene (${scene.sync.trim()})` : "Use scene"
            }
            onChange={(sync) => patch({ sync })}
          />
        </IncludeField>
        <IncludeField
          span
          label="Scheduled date"
          checked={lineLabelFieldEnabled(project, shot, "scheduledDate")}
          onToggle={(enabled) => setInclude("scheduledDate", enabled)}
        >
          <input
            type="date"
            value={shot.scheduledDate ?? ""}
            onChange={(e) => patch({ scheduledDate: e.target.value })}
          />
        </IncludeField>
        {scene.scheduledDate && !shot.scheduledDate && (
          <p className="field-help span-2">
            Scene date:{" "}
            {formatExcelDate(scene.scheduledDate, project.scheduledDateFormat) ||
              scene.scheduledDate}
          </p>
        )}
        <IncludeField
          span
          label="Notes"
          checked={lineLabelFieldEnabled(project, shot, "notes")}
          onToggle={(enabled) => setInclude("notes", enabled)}
        >
          <textarea
            rows={3}
            value={shot.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </IncludeField>
      </div>
    </>
  );
}
