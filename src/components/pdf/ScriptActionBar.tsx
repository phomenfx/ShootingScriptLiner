import { Copy, GripVertical, Link2, Scissors, Trash2, X } from "lucide-react";
import { useRef } from "react";
import * as commands from "../../commands";
import { shiftActionBar } from "../../lib/actionBarLayout";
import { shotName } from "../../model/captions";
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

/** Duplicate, split, link, and delete beside the selected mark. */
export function ScriptActionBar({ markId, shotId, isLine, anchorLeft, anchorTop, pageWidth, pageHeight }: Props) {
  const project = useProjectStore((s) => s.project);
  const offset = useSessionStore((s) => s.actionBarOffset);
  const setOffset = useSessionStore((s) => s.setActionBarOffset);
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
      <button type="button" className="script-iconbtn" title="Duplicate" onClick={() => commands.duplicateSelection()}>
        <Copy size={14} strokeWidth={1.75} />
      </button>
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
      <button type="button" className="script-iconbtn" title="Delete" onClick={() => commands.deleteSelection()}>
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="script-iconbtn" title="Close" onClick={() => commands.deselect()}>
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
