import { ClipboardCopy, ClipboardPaste, Copy, GripVertical, Link2, Lock, LockOpen, Merge, Scissors, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as commands from "../../commands";
import { shiftActionBar } from "../../lib/actionBarLayout";
import { shotName } from "../../model/captions";
import { findShot } from "../../model/edits";
import { applyColor, SWATCHES } from "../properties/ColorBar";
import { listScenes } from "../../model/shotList";
import { useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";
import { Menu, type MenuEntry } from "../topbar/Menu";

type Props = {
  markId: string;
  shotId?: string;
  isLine: boolean;
  /** Automatic spot, before the user's drag. */
  anchorLeft: number;
  anchorTop: number;
  pageWidth: number;
  pageHeight: number;
};

/** Color, duplicate, copy, paste, rejoin, split, link, lock, and delete beside the selected mark. */
export function ScriptActionBar({ markId, shotId, isLine, anchorLeft, anchorTop, pageWidth, pageHeight }: Props) {
  const project = useProjectStore((s) => s.project);
  const offset = useSessionStore((s) => s.actionBarOffset);
  const setOffset = useSessionStore((s) => s.setActionBarOffset);
  const mark = project.marks.find((m) => m.id === markId);
  // The color shown: the mark's own, else its shot's (a locked mark recolors the shot).
  const color = mark && mark.kind !== "image" ? (mark.color ?? findShot(project, mark.shotId)?.shot.color ?? project.settings.general.newShotColor) : null;
  const follows = !!mark && mark.kind !== "image" && mark.color === undefined && !!findShot(project, mark.shotId);
  const pointCount = mark?.kind === "line" ? mark.points.length : 0;
  const canPaste = useSessionStore((s) => !!s.clipboard?.length || !!s.outlineClipboard);
  // The preset swatches open above the bar; a click outside or Escape closes them.
  const [swatchesOpen, setSwatchesOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!swatchesOpen) return;
    const away = (e: PointerEvent) => {
      if (!colorRef.current?.contains(e.target as Node)) setSwatchesOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwatchesOpen(false);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [swatchesOpen]);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const place = shiftActionBar(
    { left: anchorLeft, top: anchorTop },
    offset,
    pageWidth,
    pageHeight
  );

  const shots = listScenes(project).flatMap((listed) =>
    listed.shots.map((item) => ({
      id: item.shot.id,
      label: shotName(project, {
        scene: listed.scene,
        shot: item.shot,
        sceneIndex: listed.sceneIndex,
        shotIndex: item.shotIndex,
      }),
    }))
  );
  const entries: MenuEntry[] = [
    {
      kind: "radio",
      label: "Not linked",
      checked: !shotId,
      onSelect: () => commands.linkMarkToShot(markId, ""),
    },
    ...shots.map(
      (shot): MenuEntry => ({
        kind: "radio",
        label: shot.label,
        checked: shot.id === shotId,
        onSelect: () => commands.linkMarkToShot(markId, shot.id),
      })
    ),
  ];

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, left: place.left, top: place.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const next = shiftActionBar(
      { left: start.left + (e.clientX - start.x), top: start.top + (e.clientY - start.y) },
      { x: 0, y: 0 },
      pageWidth,
      pageHeight
    );
    setOffset({ x: next.left - anchorLeft, y: next.top - anchorTop });
  };

  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="script-actionbar"
      style={{ left: place.left, top: place.top }}
      role="toolbar"
      aria-label="Mark actions"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="script-actionbar-handle"
        title="Move"
        aria-label="Move action bar"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
      >
        <GripVertical size={12} strokeWidth={1.75} />
      </div>
      {color && (
        <div className="script-actionbar-colorwrap" ref={colorRef}>
          {/* Opens the color picker below and the preset swatches above. */}
          <label
            className={`script-iconbtn script-actionbar-color${swatchesOpen ? " on" : ""}`}
            title={follows ? "Color (changes the shot's color)" : "Color"}
            onClick={() => setSwatchesOpen(true)}
          >
            <span className="color-bar-chip" style={{ background: color }} />
            <input type="color" aria-label="Pick any color" value={color} onChange={(e) => applyColor(e.target.value.toUpperCase(), true)} />
          </label>
          {swatchesOpen && (
            <div className="script-swatches" role="toolbar" aria-label="Colors">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c.toLowerCase() === color.toLowerCase() ? "color-bar-swatch on" : "color-bar-swatch"}
                  style={{ background: c }}
                  title={c}
                  aria-label={c}
                  onClick={() => {
                    applyColor(c);
                    setSwatchesOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" className="script-iconbtn" title="Duplicate" onClick={() => commands.duplicateSelection()}>
        <Copy size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Copy (Ctrl+C)" onClick={() => commands.copy()}>
        <ClipboardCopy size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Paste (Ctrl+V)" disabled={!canPaste} onClick={() => commands.paste()}>
        <ClipboardPaste size={14} strokeWidth={1.75} />
      </button>
      {isLine && (
        <button type="button" className="script-iconbtn" title={pointCount < 3 ? "Rejoin (needs a line with a bend)" : "Rejoin: remove the middle corner"} disabled={pointCount < 3} onClick={() => commands.rejoinSelection()}>
          <Merge size={14} strokeWidth={1.75} />
        </button>
      )}
      {isLine && (
        <button type="button" className="script-iconbtn" title="Split" onClick={() => commands.splitSelection()}>
          <Scissors size={14} strokeWidth={1.75} />
        </button>
      )}
      <Menu
        trigger={<Link2 size={14} strokeWidth={1.75} />}
        triggerClassName="script-iconbtn"
        triggerLabel="Link to shot"
        entries={entries}
      />
      <button
        type="button"
        className={`script-iconbtn${mark?.locked ? " on" : ""}`}
        title={mark?.locked ? "Locked in place (Ctrl+L to unlock)" : "Lock in place (Ctrl+L)"}
        aria-pressed={!!mark?.locked}
        onClick={() => commands.toggleLockSelection()}
      >
        {mark?.locked ? <Lock size={14} strokeWidth={1.75} /> : <LockOpen size={14} strokeWidth={1.75} />}
      </button>
      <button type="button" className="script-iconbtn" title="Delete" onClick={() => commands.deleteSelection()}>
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Close" onClick={() => commands.deselect()}>
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
