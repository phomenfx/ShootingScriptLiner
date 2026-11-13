import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronsDownUp, ChevronsUpDown, List, Plus, Search, Table2, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as commands from "../../commands";
import { confirm } from "../../commands";
import { openContextMenu } from "../ContextMenu";
import { outlinerCollisionDetection } from "../../lib/dndCollision";
import { createScene, createShot } from "../../model/defaults";
import * as edits from "../../model/edits";
import { lineCountsByShot, listScenes, nextPriority, nextStatus } from "../../model/shotList";
import type { Scene, Shot } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { SceneBlock, ShotRow } from "./rows";
import { ShotTable } from "./ShotTable";

/** One deliberate action is one undo step, however quickly the next one follows. */
function step(edit: edits.Edit) {
  breakUndoGroup();
  useProjectStore.getState().apply(edit);
  breakUndoGroup();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The Scenes panel in list mode: scenes and their shots, editable in place. */
/** List / Table switch in the Scenes panel header. */
export function ScenesViewSwitch() {
  const view = useSessionStore((s) => s.scenesView);
  const setView = useSessionStore((s) => s.setScenesView);
  return (
    <div className="view-switch" role="tablist" aria-label="Scenes view">
      {(["list", "table"] as const).map((v) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : undefined} onClick={() => setView(v)}>
          {v === "list" ? <List size={15} strokeWidth={1.75} /> : <Table2 size={15} strokeWidth={1.75} />}
          {v === "list" ? "List" : "Table"}
        </button>
      ))}
    </div>
  );
}

export function ScenePanel() {
  const view = useSessionStore((s) => s.scenesView);
  const project = useProjectStore((s) => s.project);
  const selection = useSessionStore((s) => s.selection);
  const collapsed = useSessionStore((s) => s.collapsedSceneIds);
  const session = useSessionStore.getState;
  const [search, setSearch] = useState("");
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const listed = useMemo(() => listScenes(project, search), [project, search]);
  const searching = search.trim() !== "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A selected line highlights the shot it belongs to.
  const selectedId = selection?.ids[0];
  const highlightedShotId =
    selection?.kind === "shot"
      ? selectedId
      : selection?.kind === "mark"
        ? (() => {
            const mark = edits.findMark(project, selectedId);
            return mark ? edits.markShotId(mark) : undefined;
          })()
        : undefined;

  /** Where + Shot puts a new shot: the scene in use, else the last one. */
  const targetSceneId =
    (selection?.kind === "scene" ? selectedId : edits.findShot(project, highlightedShotId)?.scene.id) ??
    project.scenes[project.scenes.length - 1]?.id;

  const addScene = () => {
    const scene = createScene();
    step(edits.addScene(scene));
    session().select("scene", scene.id);
  };

  const addShot = () => {
    if (!targetSceneId) return;
    const shot = createShot(project);
    step(edits.addShot(targetSceneId, shot));
    session().setSceneCollapsed(targetSceneId, false);
    session().select("shot", shot.id);
  };

  /**
   * The shot itself: its form is the base that linked lines and notes follow
   * until one of them has its own text. The page moves to its first line, but
   * the line stays unselected so the Line and Note tabs stay hidden.
   */
  const selectShot = (shot: Shot) => {
    session().select("shot", shot.id);
    const mark =
      project.marks.find((m) => m.kind === "line" && m.shotId === shot.id) ??
      project.marks.find((m) => m.kind !== "image" && m.shotId === shot.id);
    if (!mark) return;
    session().setViewerPage(mark.page);
    session().setActivePage(mark.page);
  };

  const deleteScene = async (scene: Scene, number: number) => {
    const counts = lineCountsByShot(project);
    const lines = scene.shots.reduce((sum, shot) => sum + (counts.get(shot.id) ?? 0), 0);
    if (lines > 0 && usePrefsStore.getState().confirmDeletes) {
      const message = `Delete scene ${number} and its ${plural(scene.shots.length, "shot")}? Its ${plural(lines, "line")} will stay on the script, unlinked.`;
      if (!(await confirm(message, "Delete", true))) return;
    }
    if (selection && (selectedId === scene.id || scene.shots.some((shot) => shot.id === selectedId))) {
      session().clearSelection();
    }
    session().setSceneCollapsed(scene.id, false);
    step(edits.deleteScene(scene.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragLabel(null);
    if (!over || active.id === over.id) return;
    const from = active.data.current;
    const to = over.data.current;
    const activeId = String(active.id);

    if (from?.type === "scene" && to?.type === "scene") {
      const index = project.scenes.findIndex((scene) => scene.id === over.id);
      if (index >= 0) step(edits.moveScene(activeId, index));
      return;
    }
    if (from?.type !== "shot" || (to?.type !== "shot" && to?.type !== "scene-drop")) return;

    const toSceneId = String(to.sceneId);
    const target = project.scenes.find((scene) => scene.id === toSceneId);
    if (!target) return;
    if (to.type === "scene-drop") {
      step(edits.moveShot(activeId, toSceneId, target.shots.filter((shot) => shot.id !== activeId).length));
      return;
    }
    // Within a scene the shot takes the place of the one it was dropped on;
    // coming from another scene it goes in front of it.
    const sameScene = from.sceneId === toSceneId;
    const others = sameScene ? target.shots : target.shots.filter((shot) => shot.id !== activeId);
    const index = others.findIndex((shot) => shot.id === over.id);
    if (index >= 0) step(edits.moveShot(activeId, toSceneId, index));
  };

  const allCollapsed = project.scenes.length > 0 && project.scenes.every((scene) => collapsed[scene.id]);

  if (view === "table") return <ShotTable />;

  /** Right-click on a scene or shot row: select it, then offer the clipboard actions. */
  function rowMenu(e: React.MouseEvent) {
    const target = e.target as Element;
    const shotId = target.closest("[data-shot-id]")?.getAttribute("data-shot-id");
    const sceneId = shotId ? null : target.closest("[data-scene-id]")?.getAttribute("data-scene-id");
    if (!shotId && !sceneId) return;
    if (shotId) session().select("shot", shotId);
    else if (sceneId) session().select("scene", sceneId);
    const what = shotId ? "shot" : "scene";
    const hasClip = !!session().outlineClipboard;
    const visible = shotId ? (edits.findShot(project, shotId)?.shot.visible ?? true) : (project.scenes.find((sc) => sc.id === sceneId)?.visible ?? true);
    openContextMenu(e, [
      { label: "Cut", shortcut: "Ctrl+X", onSelect: commands.cut },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: commands.copy },
      { label: "Paste", shortcut: "Ctrl+V", disabled: !hasClip, onSelect: () => commands.paste() },
      { label: `Duplicate ${what}`, shortcut: "Ctrl+D", onSelect: commands.duplicateSelection },
      "separator",
      shotId
        ? { label: "Show on script", onSelect: () => void commands.jumpToShot(shotId) }
        : { label: "Go to scene on script", onSelect: () => void commands.jumpToScene(sceneId!) },
      {
        label: visible ? `Hide ${what} on the script` : `Show ${what} on the script`,
        shortcut: visible ? (shotId ? "Ctrl+H" : "Ctrl+Shift+H") : undefined,
        onSelect: () =>
          step(
            shotId
              ? edits.updateShot(shotId, (shot) => ({ ...shot, visible: !shot.visible }))
              : edits.updateScene(sceneId!, (scene) => ({ ...scene, visible: !scene.visible }))
          ),
      },
      "separator",
      { label: `Delete ${what}`, shortcut: "Del", danger: true, onSelect: commands.deleteSelection },
    ]);
  }

  return (
    <div className="scene-panel">
      <div className="scene-tools">
        <label className="scene-search">
          <Search size={14} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search"
            aria-label="Search scenes and shots"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          />
          {searching && (
            <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearch("")}>
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </label>
        <button
          type="button"
          className="tool-btn icon"
          title="Collapse all"
          aria-label="Collapse all scenes"
          disabled={allCollapsed}
          onClick={() => session().setCollapsedScenes(project.scenes.map((scene) => scene.id))}
        >
          <ChevronsDownUp size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="tool-btn icon"
          title="Expand all"
          aria-label="Expand all scenes"
          disabled={Object.keys(collapsed).length === 0}
          onClick={() => session().setCollapsedScenes([])}
        >
          <ChevronsUpDown size={15} strokeWidth={1.75} />
        </button>
        <button type="button" className="tool-btn" onClick={addScene}>
          <Plus size={13} strokeWidth={2} />
          Scene
        </button>
        <button type="button" className="tool-btn" disabled={!targetSceneId} title={targetSceneId ? undefined : "Add a scene first"} onClick={addShot}>
          <Plus size={13} strokeWidth={2} />
          Shot
        </button>
      </div>

      <div className="scene-list" role="grid" aria-label="Scenes and shots" onContextMenu={rowMenu}>
        {project.scenes.length === 0 && (
          <div className="scene-list-empty">
            <p>No scenes yet. Add a scene, then add its shots.</p>
            {project.script && (
              <button type="button" className="tool-btn" onClick={() => void commands.detectScenes()}>
                Detect scenes from script
              </button>
            )}
          </div>
        )}
        {project.scenes.length > 0 && listed.length === 0 && (
          <p className="scene-list-empty">Nothing matches "{search.trim()}".</p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={outlinerCollisionDetection}
          onDragStart={({ active }) => {
            const found = listed.find((l) => l.scene.id === active.id);
            const shot = listed.flatMap((l) => l.shots).find((item) => item.shot.id === active.id);
            setDragLabel(found ? `Scene ${found.sceneIndex + 1}` : shot ? `Shot ${shot.id}` : null);
          }}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragLabel(null)}
        >
          <SortableContext items={listed.map((l) => l.scene.id)} strategy={verticalListSortingStrategy}>
            {listed.map((l) => (
              <SceneBlock
                key={l.scene.id}
                listed={l}
                // While searching, every match is shown.
                collapsed={!searching && !!collapsed[l.scene.id]}
                selected={selection?.kind === "scene" && selectedId === l.scene.id}
                dragDisabled={searching}
                onSelect={() => session().select("scene", l.scene.id)}
                onToggleCollapsed={() => session().setSceneCollapsed(l.scene.id, !collapsed[l.scene.id])}
                onHeading={(patch) =>
                  step(edits.updateScene(l.scene.id, (scene) => ({ ...scene, heading: { ...scene.heading, ...patch } })))
                }
                onToggleVisible={() => step(edits.updateScene(l.scene.id, (scene) => ({ ...scene, visible: !scene.visible })))}
                onDelete={() => void deleteScene(l.scene, l.sceneIndex + 1)}
              >
                {l.shots.map((item) => (
                  <ShotRow
                    key={item.shot.id}
                    item={item}
                    sceneId={l.scene.id}
                    project={project}
                    selected={highlightedShotId === item.shot.id}
                    dragDisabled={searching}
                    onSelect={() => selectShot(item.shot)}
                    onPatch={(patch) =>
                      step(
                        edits.updateShot(item.shot.id, (shot) => {
                          const next = { ...shot, ...patch };
                          for (const key of Object.keys(patch) as (keyof Shot)[]) {
                            if (next[key] === undefined) delete next[key];
                          }
                          return next;
                        })
                      )
                    }
                    onCycleStatus={() =>
                      step(edits.updateShot(item.shot.id, (shot) => ({ ...shot, status: nextStatus(shot.status, project.settings.lists) })))
                    }
                    onCyclePriority={() =>
                      step(
                        edits.updateShot(item.shot.id, (shot) => ({
                          ...shot,
                          priority: nextPriority(shot.priority, project.settings.lists),
                        }))
                      )
                    }
                  />
                ))}
              </SceneBlock>
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>{dragLabel && <div className="drag-chip">{dragLabel}</div>}</DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
