import { useEffect, useState } from "react";
import {
  findShot,
  getLineDisplayLabel,
  getTextDisplayText,
  resolveTextColor,
  textFieldLocks,
} from "../../lib/annotationUtils";
import { SluglineFields, SLUGLINE_PLACEHOLDERS } from "../SluglineFields";
import { GEAR_PLACEHOLDERS, ShotDetailFields, SyncSelect } from "./ShotDetailFields";
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
import {
  DEFAULT_LINE_LOCKS,
  DEFAULT_TEXT_LOCKS,
  UNLINKED_LINE_LOCKS,
  UNLINKED_TEXT_LOCKS,
} from "../../types/annotations";
import { EndingFields, patchStyleEnd } from "./EndingFields";
import { formatToolKeyDisplay } from "../../lib/toolKeybinds";

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
  const duplicateText = useProjectStore((s) => s.duplicateText);
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
  const textLinked = textSel?.shotId ? findShot(project, textSel.shotId) : null;
  const textLocks = textSel ? textFieldLocks(textSel) : UNLINKED_TEXT_LOCKS;

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
                onChange={(e) => {
                  const shotId = e.target.value || undefined;
                  if (!shotId) {
                    const label = line.label?.trim()
                      ? line.label
                      : getLineDisplayLabel({ ...line, label: "" }, project);
                    updateLine(line.id, {
                      shotId: undefined,
                      label,
                      locks: { ...UNLINKED_LINE_LOCKS },
                    });
                    return;
                  }
                  const scene = getSortedScenes(project.scenes).find((sc) =>
                    sc.shots.some((sh) => sh.id === shotId)
                  );
                  if (scene) updateLine(line.id, { shotId, locks: { ...DEFAULT_LINE_LOCKS } });
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
          </div>

          {linkedLabel && (
            <p className="linked-shot-preview" style={{ color: linked?.shot.color }}>
              {linkedLabel}
            </p>
          )}

          {!linked && (
            <label className="field compact">
              Custom text
              <textarea
                rows={3}
                placeholder="Custom label"
                value={line.label ?? ""}
                onChange={(e) => updateLine(line.id, { label: e.target.value })}
              />
            </label>
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
              if (payload) {
                updateText(textSel.id, {
                  shotId: payload.shotId,
                  followShot: true,
                  locks: { ...DEFAULT_TEXT_LOCKS },
                });
              }
            }}
          >
            <label className="field compact flex-grow">
              Linked shot
              <select
                value={textSel.shotId ?? ""}
                onChange={(e) => {
                  const shotId = e.target.value || undefined;
                  if (!shotId) {
                    const shown = getTextDisplayText(textSel, project);
                    updateText(textSel.id, {
                      shotId: undefined,
                      followShot: false,
                      locks: { ...UNLINKED_TEXT_LOCKS },
                      text: textSel.text.trim() ? textSel.text : shown,
                    });
                    return;
                  }
                  updateText(textSel.id, {
                    shotId,
                    followShot: true,
                    locks: { ...DEFAULT_TEXT_LOCKS },
                  });
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
          </div>

          {textLinked && (
            <p className="linked-shot-preview" style={{ color: textLinked.shot.color }}>
              {formatShotLabel(
                textLinked.scene,
                textLinked.shot,
                project.scenes,
                project.labelMode,
                project.additionalInfoStyle
              )}
            </p>
          )}

          {!textLinked && (
            <label className="field compact">
              Custom text
              <textarea
                rows={3}
                placeholder="Custom text"
                value={textSel.text}
                onChange={(e) => updateText(textSel.id, { text: e.target.value })}
              />
            </label>
          )}

          {textLinked && (
            <>
              <h5 className="props-subtitle">Shot (linked)</h5>
              <ShotDetailFields scene={textLinked.scene} shot={textLinked.shot} />
              <div className="props-grid dense">
                <div className="prop-with-lock span-2">
                  <label className="field compact flex-grow">
                    Text
                    <textarea
                      rows={3}
                      placeholder={getTextDisplayText(
                        { ...textSel, text: "", followShot: false },
                        project
                      )}
                      value={
                        textSel.followShot
                          ? getTextDisplayText(textSel, project)
                          : textSel.text
                      }
                      disabled={textSel.followShot === true}
                      onChange={(e) => updateText(textSel.id, { text: e.target.value })}
                    />
                  </label>
                  <LockBtn
                    locked={textSel.followShot === true}
                    title="text"
                    onToggle={() =>
                      updateText(textSel.id, { followShot: !textSel.followShot })
                    }
                  />
                </div>
                <div className="prop-with-lock">
                  <label className="field compact flex-grow">
                    Text color
                    <input
                      type="color"
                      value={resolveTextColor(textSel, project)}
                      disabled={textLocks.color}
                      onChange={(e) => updateText(textSel.id, { color: e.target.value })}
                    />
                  </label>
                  <LockBtn
                    locked={textLocks.color}
                    title="color"
                    onToggle={() =>
                      updateText(textSel.id, {
                        locks: { ...textLocks, color: !textLocks.color },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

          {!textLinked && (
            <label className="field compact">
              Color
              <input
                type="color"
                value={textSel.color}
                onChange={(e) => updateText(textSel.id, { color: e.target.value })}
              />
            </label>
          )}

          <h5 className="props-subtitle">Caption</h5>
          <div className="props-grid dense">
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
            <label className="field compact">
              Size (pt)
              <input
                type="number"
                min={6}
                max={48}
                step={0.5}
                value={textSel.fontSize ?? 11}
                onChange={(e) =>
                  updateText(textSel.id, {
                    fontSize: Math.max(6, Number(e.target.value) || 11),
                  })
                }
              />
            </label>
            <label className="field-inline compact span-2">
              <input
                type="checkbox"
                checked={textSel.labelBold ?? project.defaultLine.labelBold}
                onChange={(e) => updateText(textSel.id, { labelBold: e.target.checked })}
              />
              Bold
            </label>
            <label className="field-inline compact span-2">
              <input
                type="checkbox"
                checked={textSel.showText !== false}
                onChange={(e) => updateText(textSel.id, { showText: e.target.checked })}
              />
              Show text on script
            </label>
          </div>
          <div className="props-actions">
            <button type="button" onClick={() => duplicateText(textSel.id)}>
              Duplicate text
            </button>
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
          <ShotDetailFields
            title="Shot"
            scene={shotOnly.scene}
            shot={shotOnly.shot}
          />
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
