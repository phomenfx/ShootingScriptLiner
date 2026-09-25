import { useEffect, useState, type ReactNode } from "react";
import { findShot, getLineDisplayLabel, getTextDisplayText } from "../../lib/annotationUtils";
import { formatExcelDate } from "../../lib/dateFormat";
import {
  formatLineCaption,
  lineLabelFieldEnabled,
  nextLineLabelInclude,
} from "../../lib/lineCaption";
import { type LineLabelFieldId } from "../../types/lineLabelFields";
import { SYNC_STATUSES } from "../../types/project";
import { SluglineFields, SLUGLINE_PLACEHOLDERS } from "../SluglineFields";
import {
  ensureViewerFontLoaded,
  getFontOptions,
  loadBundledFonts,
  parseShotLinkPayload,
  SHOT_LINK_MIME,
} from "../../lib/fonts";
import { STROKE_OPTIONS } from "../../lib/lineStrokes";
import { formatShotLabel, getSortedScenes, getSortedShots } from "../../lib/labelUtils";
import { useProjectStore } from "../../stores/projectStore";
import type { LineFieldLocks, LineStroke } from "../../types/annotations";
import { DEFAULT_LINE_LOCKS } from "../../types/annotations";
import { EndingFields, patchStyleEnd } from "./EndingFields";
import { formatToolKeyDisplay } from "../../lib/toolKeybinds";

function inheritPlaceholder(sceneValue: string | undefined, fallback: string): string {
  const trimmed = sceneValue?.trim() ?? "";
  return trimmed || fallback;
}

function SyncSelect({
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

const GEAR_PLACEHOLDERS = {
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

function LockBtn({
  locked,
  onToggle,
  title,
}: {
  locked: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`lock-btn ${locked ? "locked" : ""}`}
      title={locked ? `Unlock ${title}` : `Lock to shot ${title}`}
      onClick={onToggle}
      aria-label={title}
    >
      {locked ? "🔒" : "🔓"}
    </button>
  );
}

export function PropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const updateLine = useProjectStore((s) => s.updateLine);
  const updateLineLocks = useProjectStore((s) => s.updateLineLocks);
  const updateShot = useProjectStore((s) => s.updateShot);
  const updateScene = useProjectStore((s) => s.updateScene);
  const updateText = useProjectStore((s) => s.updateText);
  const duplicateLine = useProjectStore((s) => s.duplicateLine);
  const deleteAnnotation = useProjectStore((s) => s.deleteAnnotation);
  const deleteShot = useProjectStore((s) => s.deleteShot);
  const deleteLinesForShot = useProjectStore((s) => s.deleteLinesForShot);
  const setConfirm = useProjectStore((s) => s.setConfirm);
  const selectShot = useProjectStore((s) => s.selectShot);
  const toolKeybinds = useProjectStore((s) => s.toolKeybinds);

  const [fontOptions, setFontOptions] = useState(getFontOptions());
  const [dropOver, setDropOver] = useState(false);

  useEffect(() => {
    void loadBundledFonts().then(() => setFontOptions(getFontOptions()));
  }, []);

  const ann =
    selection?.kind === "annotation"
      ? project.annotations.find((a) => a.id === selection.annotationId)
      : null;
  const line = ann?.kind === "line" ? ann : null;
  const textSel = ann?.kind === "text" ? ann : null;

  const linked = line?.shotId ? findShot(project, line.shotId) : null;

  const shotOnly =
    selection?.kind === "shot"
      ? (() => {
          const scene = project.scenes.find((sc) => sc.id === selection.sceneId);
          const shot = scene?.shots.find((sh) => sh.id === selection.shotId);
          return scene && shot ? { scene, shot } : null;
        })()
      : null;

  const sceneOnly =
    selection?.kind === "scene"
      ? (project.scenes.find((sc) => sc.id === selection.sceneId) ?? null)
      : null;

  const linkShot = (sceneId: string, shotId: string) => {
    if (!line) return;
    updateLine(line.id, { shotId, locks: { ...DEFAULT_LINE_LOCKS } });
    selectShot(sceneId, shotId);
  };

  const setLock = (key: keyof LineFieldLocks, value: boolean) => {
    if (!line) return;
    updateLineLocks(line.id, { [key]: value });
  };

  const setShotInclude = (id: LineLabelFieldId, enabled: boolean) => {
    if (!shotOnly) return;
    updateShot(shotOnly.scene.id, shotOnly.shot.id, {
      lineLabelInclude: nextLineLabelInclude(project, shotOnly.shot, id, enabled),
    });
  };

  const linkedLabel = linked
    ? formatShotLabel(
        linked.scene,
        linked.shot,
        project.scenes,
        project.labelMode,
        project.additionalInfoStyle
      )
    : null;

  return (
    <div className="properties-panel">
      <h3 className="properties-title">Properties</h3>

      {!line && !shotOnly && !textSel && !sceneOnly && (
        <div className="properties-guide">
          <p>
            Use the outliner in the bottom left to create, label, rearrange, and delete scenes
            and shots.
          </p>
          <p>
            Use <kbd>{formatToolKeyDisplay(toolKeybinds.select)}</kbd> to select,{" "}
            <kbd>{formatToolKeyDisplay(toolKeybinds.line)}</kbd> to create new lines, and{" "}
            <kbd>{formatToolKeyDisplay(toolKeybinds.text)}</kbd> to create text notes. Change
            these keys in Settings.
          </p>
          <p>
            Hold <kbd>Shift</kbd> while drawing to snap angles when snap is off (0°).
          </p>
          <p>
            If a line for a shot needs to go between pages, drag it past the top and bottom
            margins of the page to indicate the shot continues.
          </p>
        </div>
      )}

      {line && (
        <section className="props-section">
          <h4 className="props-section-title">Line</h4>
          <div
            className={`shot-drop-zone ${dropOver ? "over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOver(false);
              const payload = parseShotLinkPayload(e.dataTransfer.getData(SHOT_LINK_MIME));
              if (payload) linkShot(payload.sceneId, payload.shotId);
            }}
          >
            <label className="field compact flex-grow">
              Linked shot
              <select
                value={line.shotId ?? ""}
                disabled={line.locks.shotId}
                onChange={(e) => {
                  const shotId = e.target.value || undefined;
                  if (!shotId) {
                    updateLine(line.id, {
                      shotId: undefined,
                      locks: {
                        shotId: false,
                        shotType: false,
                        label: false,
                        color: false,
                      },
                    });
                    return;
                  }
                  const scene = getSortedScenes(project.scenes).find((sc) =>
                    sc.shots.some((sh) => sh.id === shotId)
                  );
                  if (scene) linkShot(scene.id, shotId);
                }}
              >
                <option value="">Drop shot here or pick…</option>
                {getSortedScenes(project.scenes).map((sc) =>
                  getSortedShots(sc).map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {formatShotLabel(
                        sc,
                        sh,
                        project.scenes,
                        project.labelMode,
                        project.additionalInfoStyle
                      )}
                    </option>
                  ))
                )}
              </select>
            </label>
            <LockBtn
              locked={line.locks.shotId}
              title="link"
              onToggle={() => setLock("shotId", !line.locks.shotId)}
            />
          </div>

          {linkedLabel && (
            <p className="linked-shot-preview" style={{ color: linked?.shot.color }}>
              {linkedLabel}
            </p>
          )}

          {linked && (
            <>
              <h5 className="props-subtitle">Shot (linked)</h5>
              <div className="props-grid dense">
                <div className="prop-with-lock span-2">
                  <label className="field compact flex-grow">
                    Shot type
                    <input
                      type="text"
                      placeholder="WS, MS…"
                      value={linked.shot.shotType ?? ""}
                      disabled={!line.shotId || line.locks.shotType}
                      onChange={(e) =>
                        updateShot(linked.scene.id, linked.shot.id, {
                          shotType: e.target.value,
                        })
                      }
                    />
                  </label>
                  <LockBtn
                    locked={line.locks.shotType}
                    title="shot type"
                    onToggle={() => setLock("shotType", !line.locks.shotType)}
                  />
                </div>
                <div className="prop-with-lock span-2">
                  <label className="field compact flex-grow">
                    Label
                    <input
                      type="text"
                      placeholder={
                        line.shotId
                          ? getLineDisplayLabel({ ...line, label: "" }, project)
                          : "Custom label"
                      }
                      value={
                        line.locks.label
                          ? getLineDisplayLabel(line, project)
                          : (line.label ?? "")
                      }
                      disabled={line.locks.label}
                      onChange={(e) => updateLine(line.id, { label: e.target.value })}
                    />
                  </label>
                  <LockBtn
                    locked={line.locks.label}
                    title="label"
                    onToggle={() => setLock("label", !line.locks.label)}
                  />
                </div>
                <div className="prop-with-lock">
                  <label className="field compact flex-grow">
                    Color
                    <input
                      type="color"
                      value={line.style.color}
                      disabled={line.locks.color}
                      onChange={(e) =>
                        updateLine(line.id, {
                          style: { ...line.style, color: e.target.value },
                        })
                      }
                    />
                  </label>
                  <LockBtn
                    locked={line.locks.color}
                    title="color"
                    onToggle={() => setLock("color", !line.locks.color)}
                  />
                </div>
              </div>
            </>
          )}

          <h5 className="props-subtitle">Style</h5>
          <div className="props-grid dense">
            {!linked && (
              <label className="field compact">
                Stroke color
                <input
                  type="color"
                  value={line.style.color}
                  onChange={(e) =>
                    updateLine(line.id, {
                      style: { ...line.style, color: e.target.value },
                    })
                  }
                />
              </label>
            )}
            <label className={`field compact ${linked ? "span-2" : ""}`}>
              Border style
              <select
                value={line.style.stroke}
                onChange={(e) =>
                  updateLine(line.id, {
                    style: {
                      ...line.style,
                      stroke: e.target.value as LineStroke,
                    },
                  })
                }
              >
                {STROKE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact">
              Width (pt)
              <input
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                value={line.style.widthPt}
                onChange={(e) =>
                  updateLine(line.id, {
                    style: {
                      ...line.style,
                      widthPt: Math.max(0.25, Number(e.target.value) || 1),
                    },
                  })
                }
              />
            </label>
          </div>

          <EndingFields
            label="Start"
            ending={line.style.start}
            onChange={(start) =>
              updateLine(line.id, { style: patchStyleEnd(line.style, "start", start) })
            }
          />
          <EndingFields
            label="End"
            ending={line.style.end}
            onChange={(end) =>
              updateLine(line.id, { style: patchStyleEnd(line.style, "end", end) })
            }
          />

          <h5 className="props-subtitle">Caption</h5>
          <div className="props-grid dense">
            <label className="field compact span-2">
              Font
              <select
                value={line.fontFamily}
                onChange={(e) => {
                  const fontFamily = e.target.value;
                  void ensureViewerFontLoaded(fontFamily).then(() =>
                    updateLine(line.id, { fontFamily })
                  );
                }}
              >
                {fontOptions.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact">
              Size (pt)
              <input
                type="number"
                min={6}
                max={48}
                step={0.5}
                value={line.fontSizePt}
                onChange={(e) =>
                  updateLine(line.id, {
                    fontSizePt: Math.max(6, Number(e.target.value) || 11),
                  })
                }
              />
            </label>
            <label className="field-inline compact span-2">
              <input
                type="checkbox"
                checked={line.labelBold}
                onChange={(e) => updateLine(line.id, { labelBold: e.target.checked })}
              />
              Bold
            </label>
            <label className="field-inline compact span-2">
              <input
                type="checkbox"
                checked={line.showLabel}
                onChange={(e) => updateLine(line.id, { showLabel: e.target.checked })}
              />
              Show label on script
            </label>
          </div>

          <div className="props-actions">
            <button type="button" onClick={() => duplicateLine(line.id)}>
              Duplicate line
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => deleteAnnotation(line.id)}
            >
              Delete line
            </button>
          </div>
        </section>
      )}

      {textSel && (
        <section className="props-section">
          <h4 className="props-section-title">Text</h4>
          <div className="props-actions text-mode-actions">
            {textSel.shotId ? (
              <button
                type="button"
                onClick={() =>
                  updateText(textSel.id, { shotId: undefined, followShot: false })
                }
              >
                Use custom text
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const first = getSortedScenes(project.scenes).flatMap((sc) =>
                    getSortedShots(sc)
                  )[0];
                  if (!first) return;
                  updateText(textSel.id, { shotId: first.id, followShot: true });
                }}
              >
                Use shot text
              </button>
            )}
          </div>
          {textSel.shotId && (
            <div className="prop-with-lock span-2 text-shot-link">
              <label className="field compact flex-grow">
                Shot
                <select
                  value={textSel.shotId}
                  onChange={(e) =>
                    updateText(textSel.id, {
                      shotId: e.target.value || undefined,
                      followShot: Boolean(e.target.value),
                    })
                  }
                >
                  <option value="">Choose a shot…</option>
                  {getSortedScenes(project.scenes).map((sc) =>
                    getSortedShots(sc).map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {formatShotLabel(
                          sc,
                          sh,
                          project.scenes,
                          project.labelMode,
                          project.additionalInfoStyle
                        )}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <LockBtn
                locked={textSel.followShot === true}
                title="shot text"
                onToggle={() => {
                  if (textSel.followShot) {
                    updateText(textSel.id, {
                      followShot: false,
                      text: getTextDisplayText(textSel, project),
                    });
                  } else {
                    updateText(textSel.id, { followShot: true });
                  }
                }}
              />
            </div>
          )}
          <div className="props-grid dense">
            <label className="field compact span-2">
              Content
              <textarea
                rows={3}
                value={
                  textSel.followShot && textSel.shotId
                    ? getTextDisplayText(textSel, project)
                    : textSel.text
                }
                disabled={Boolean(textSel.followShot && textSel.shotId)}
                onChange={(e) => updateText(textSel.id, { text: e.target.value })}
              />
            </label>
            <label className="field compact">
              Color
              <input
                type="color"
                value={textSel.color}
                onChange={(e) => updateText(textSel.id, { color: e.target.value })}
              />
            </label>
            <label className="field compact">
              Size (pt)
              <input
                type="number"
                min={6}
                max={72}
                step={1}
                value={textSel.fontSize ?? 11}
                onChange={(e) =>
                  updateText(textSel.id, {
                    fontSize: Math.max(6, Number(e.target.value) || 11),
                  })
                }
              />
            </label>
            <label className="field compact span-2">
              Font
              <select
                value={textSel.fontFamily ?? '"Arial", sans-serif'}
                onChange={(e) => {
                  const fontFamily = e.target.value;
                  void ensureViewerFontLoaded(fontFamily).then(() =>
                    updateText(textSel.id, { fontFamily })
                  );
                }}
              >
                {fontOptions.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-inline compact span-2">
              <input
                type="checkbox"
                checked={textSel.labelBold ?? project.defaultLine.labelBold}
                onChange={(e) => updateText(textSel.id, { labelBold: e.target.checked })}
              />
              Bold
            </label>
          </div>
          <div className="props-actions">
            <button
              type="button"
              className="btn-danger"
              onClick={() => deleteAnnotation(textSel.id)}
            >
              Delete text
            </button>
          </div>
        </section>
      )}

      {sceneOnly && (
        <section className="props-section">
          <h4 className="props-section-title">Scene</h4>
          <div className="props-grid dense">
            <SluglineFields
              indicator={sceneOnly.indicator ?? ""}
              location={sceneOnly.location ?? ""}
              timeOfDay={sceneOnly.timeOfDay ?? ""}
              placeholders={SLUGLINE_PLACEHOLDERS}
              onChange={(patch) => updateScene(sceneOnly.id, patch)}
            />
            <label className="field compact span-2">
              System/Movement
              <input
                type="text"
                placeholder={GEAR_PLACEHOLDERS.cameraSupport}
                value={sceneOnly.cameraSupport ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { cameraSupport: e.target.value })}
              />
            </label>
            <label className="field compact">
              Lens
              <input
                type="text"
                placeholder={GEAR_PLACEHOLDERS.lens}
                value={sceneOnly.lens ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { lens: e.target.value })}
              />
            </label>
            <label className="field compact">
              Audio
              <input
                type="text"
                placeholder={GEAR_PLACEHOLDERS.audio}
                value={sceneOnly.audioSource ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { audioSource: e.target.value })}
              />
            </label>
            <label className="field compact span-2">
              Camera
              <input
                type="text"
                placeholder={GEAR_PLACEHOLDERS.camera}
                value={sceneOnly.camera ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { camera: e.target.value })}
              />
            </label>
            <label className="field compact">
              FPS
              <input
                type="text"
                placeholder={GEAR_PLACEHOLDERS.fps}
                value={sceneOnly.fps ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { fps: e.target.value })}
              />
            </label>
            <label className="field compact">
              Sync
              <SyncSelect
                value={sceneOnly.sync ?? ""}
                blankLabel=""
                onChange={(sync) => updateScene(sceneOnly.id, { sync })}
              />
            </label>
            <label className="field compact span-2">
              Scheduled date
              <input
                type="date"
                value={sceneOnly.scheduledDate ?? ""}
                onChange={(e) => updateScene(sceneOnly.id, { scheduledDate: e.target.value })}
              />
            </label>
          </div>
        </section>
      )}

      {shotOnly && (
        <section className="props-section">
          <div className="shot-caption-row">
            <label className="field compact shot-color-field">
              Color
              <input
                type="color"
                value={shotOnly.shot.color}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { color: e.target.value })
                }
              />
            </label>
            <div className="shot-caption-copy">
              <h4 className="props-section-title">Shot</h4>
              <label className="shot-caption-check">
                <input
                  type="checkbox"
                  checked={lineLabelFieldEnabled(project, shotOnly.shot, "shotNumber")}
                  onChange={(e) => setShotInclude("shotNumber", e.target.checked)}
                />
                <span className="shot-caption-text" style={{ color: shotOnly.shot.color }}>
                  {formatLineCaption(shotOnly.scene, shotOnly.shot, project)}
                </span>
              </label>
            </div>
          </div>
          <div className="props-grid dense">
            <IncludeField
              label="Shot type"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "shotType")}
              onToggle={(enabled) => setShotInclude("shotType", enabled)}
            >
              <input
                type="text"
                placeholder="WS, MS, MCU…"
                value={shotOnly.shot.shotType ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { shotType: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              label="Subject"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "subject")}
              onToggle={(enabled) => setShotInclude("subject", enabled)}
            >
              <input
                type="text"
                placeholder="Subject, Master…"
                value={shotOnly.shot.subject ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { subject: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              span
              label="Additional info"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "additionalInfo")}
              onToggle={(enabled) => setShotInclude("additionalInfo", enabled)}
            >
              <input
                type="text"
                placeholder="Moving Master…"
                value={shotOnly.shot.slug ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { slug: e.target.value })
                }
              />
            </IncludeField>
            <SluglineFields
              indicator={shotOnly.shot.indicator ?? ""}
              location={shotOnly.shot.location ?? ""}
              timeOfDay={shotOnly.shot.timeOfDay ?? ""}
              placeholders={{
                indicator: inheritPlaceholder(shotOnly.scene.indicator, SLUGLINE_PLACEHOLDERS.indicator),
                location: inheritPlaceholder(shotOnly.scene.location, SLUGLINE_PLACEHOLDERS.location),
                timeOfDay: inheritPlaceholder(shotOnly.scene.timeOfDay, SLUGLINE_PLACEHOLDERS.timeOfDay),
              }}
              checks={{
                indicator: {
                  checked: lineLabelFieldEnabled(project, shotOnly.shot, "indicator"),
                  onToggle: (enabled) => setShotInclude("indicator", enabled),
                },
                location: {
                  checked: lineLabelFieldEnabled(project, shotOnly.shot, "location"),
                  onToggle: (enabled) => setShotInclude("location", enabled),
                },
                timeOfDay: {
                  checked: lineLabelFieldEnabled(project, shotOnly.shot, "timeOfDay"),
                  onToggle: (enabled) => setShotInclude("timeOfDay", enabled),
                },
              }}
              onChange={(patch) => updateShot(shotOnly.scene.id, shotOnly.shot.id, patch)}
            />
            <p className="field-help span-2">Leave blank to use the scene.</p>
            <IncludeField
              span
              label="System/Movement"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "cameraSupport")}
              onToggle={(enabled) => setShotInclude("cameraSupport", enabled)}
            >
              <input
                type="text"
                placeholder={inheritPlaceholder(
                  shotOnly.scene.cameraSupport,
                  GEAR_PLACEHOLDERS.cameraSupport
                )}
                value={shotOnly.shot.cameraSupport ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, {
                    cameraSupport: e.target.value,
                  })
                }
              />
            </IncludeField>
            <IncludeField
              label="Lens"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "lens")}
              onToggle={(enabled) => setShotInclude("lens", enabled)}
            >
              <input
                type="text"
                placeholder={inheritPlaceholder(shotOnly.scene.lens, GEAR_PLACEHOLDERS.lens)}
                value={shotOnly.shot.lens ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { lens: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              label="Audio"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "audio")}
              onToggle={(enabled) => setShotInclude("audio", enabled)}
            >
              <input
                type="text"
                placeholder={inheritPlaceholder(shotOnly.scene.audioSource, GEAR_PLACEHOLDERS.audio)}
                value={shotOnly.shot.audioSource ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { audioSource: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              span
              label="Camera"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "camera")}
              onToggle={(enabled) => setShotInclude("camera", enabled)}
            >
              <input
                type="text"
                placeholder={inheritPlaceholder(shotOnly.scene.camera, GEAR_PLACEHOLDERS.camera)}
                value={shotOnly.shot.camera ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { camera: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              label="FPS"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "fps")}
              onToggle={(enabled) => setShotInclude("fps", enabled)}
            >
              <input
                type="text"
                placeholder={inheritPlaceholder(shotOnly.scene.fps, GEAR_PLACEHOLDERS.fps)}
                value={shotOnly.shot.fps ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { fps: e.target.value })
                }
              />
            </IncludeField>
            <IncludeField
              label="Sync"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "sync")}
              onToggle={(enabled) => setShotInclude("sync", enabled)}
            >
              <SyncSelect
                value={shotOnly.shot.sync ?? ""}
                blankLabel={
                  shotOnly.scene.sync?.trim()
                    ? `Use scene (${shotOnly.scene.sync.trim()})`
                    : "Use scene"
                }
                onChange={(sync) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { sync })
                }
              />
            </IncludeField>
            <IncludeField
              span
              label="Scheduled date"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "scheduledDate")}
              onToggle={(enabled) => setShotInclude("scheduledDate", enabled)}
            >
              <input
                type="date"
                value={shotOnly.shot.scheduledDate ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, {
                    scheduledDate: e.target.value,
                  })
                }
              />
            </IncludeField>
            {shotOnly.scene.scheduledDate && !shotOnly.shot.scheduledDate && (
              <p className="field-help span-2">
                Scene date:{" "}
                {formatExcelDate(shotOnly.scene.scheduledDate, project.scheduledDateFormat) ||
                  shotOnly.scene.scheduledDate}
              </p>
            )}
            <IncludeField
              span
              label="Notes"
              checked={lineLabelFieldEnabled(project, shotOnly.shot, "notes")}
              onToggle={(enabled) => setShotInclude("notes", enabled)}
            >
              <textarea
                rows={3}
                value={shotOnly.shot.notes ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { notes: e.target.value })
                }
              />
            </IncludeField>
          </div>
          <div className="props-actions shot-props-actions">
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                setConfirm({
                  message: "Delete this shot? Lines on the script will become unlinked.",
                  onYes: () => deleteShot(shotOnly.scene.id, shotOnly.shot.id),
                })
              }
            >
              Delete shot
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  message: "Delete all lines linked to this shot?",
                  onYes: () => deleteLinesForShot(shotOnly.shot.id),
                })
              }
            >
              Delete all lines
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
