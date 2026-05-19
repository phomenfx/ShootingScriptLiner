import { useEffect, useState } from "react";
import { findShot, getLineDisplayLabel } from "../../lib/annotationUtils";
import {
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

      {!line && !shotOnly && !textSel && (
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
                onChange={(e) => updateLine(line.id, { fontFamily: e.target.value })}
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
          <div className="props-grid dense">
            <label className="field compact span-2">
              Content
              <textarea
                rows={3}
                value={textSel.text}
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
                onChange={(e) => updateText(textSel.id, { fontFamily: e.target.value })}
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

      {shotOnly && (
        <section className="props-section">
          <h4 className="props-section-title">Shot</h4>
          <p className="linked-shot-preview" style={{ color: shotOnly.shot.color }}>
            {formatShotLabel(
              shotOnly.scene,
              shotOnly.shot,
              project.scenes,
              project.labelMode,
              project.additionalInfoStyle
            )}
          </p>
          <div className="props-grid dense">
            <label className="field compact span-2">
              Shot type
              <input
                type="text"
                placeholder="WS, MS, MCU…"
                value={shotOnly.shot.shotType ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, {
                    shotType: e.target.value,
                  })
                }
              />
            </label>
            <label className="field compact span-2">
              Label
              <input
                type="text"
                placeholder="Subject, Master…"
                value={shotOnly.shot.subject ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, {
                    subject: e.target.value,
                  })
                }
              />
            </label>
            <label className="field compact span-2">
              Additional info
              <input
                type="text"
                placeholder="Moving Master…"
                value={shotOnly.shot.slug ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { slug: e.target.value })
                }
              />
            </label>
            <label className="field compact">
              Color
              <input
                type="color"
                value={shotOnly.shot.color}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { color: e.target.value })
                }
              />
            </label>
            <label className="field compact span-2">
              Notes
              <textarea
                rows={3}
                value={shotOnly.shot.notes ?? ""}
                onChange={(e) =>
                  updateShot(shotOnly.scene.id, shotOnly.shot.id, { notes: e.target.value })
                }
              />
            </label>
          </div>
          <div className="props-actions">
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
          </div>
        </section>
      )}
    </div>
  );
}
