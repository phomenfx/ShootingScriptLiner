import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { outlinerCollisionDetection } from "../../lib/dndCollision";
import { getSortedScenes, getSortedShots } from "../../lib/labelUtils";
import { useProjectStore } from "../../stores/projectStore";
import { DragOverlayPreview } from "./DragOverlayPreview";
import { SortableSceneRow } from "./SortableSceneRow";

type DragItem =
  | { type: "scene"; sceneId: string }
  | { type: "shot"; sceneId: string; shotId: string };

export function SceneOutliner() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const addScene = useProjectStore((s) => s.addScene);
  const addShot = useProjectStore((s) => s.addShot);
  const selectScene = useProjectStore((s) => s.selectScene);
  const selectShot = useProjectStore((s) => s.selectShot);
  const updateScene = useProjectStore((s) => s.updateScene);
  const updateShot = useProjectStore((s) => s.updateShot);
  const deleteScene = useProjectStore((s) => s.deleteScene);
  const setConfirm = useProjectStore((s) => s.setConfirm);
  const reorderScenes = useProjectStore((s) => s.reorderScenes);
  const moveShotWithinScene = useProjectStore((s) => s.moveShotWithinScene);
  const reorderShots = useProjectStore((s) => s.reorderShots);
  const getLastSelectedSceneId = useProjectStore((s) => s.getLastSelectedSceneId);

  const [dragItem, setDragItem] = useState<DragItem | null>(null);

  const scenes = getSortedScenes(project.scenes);
  const sceneIds = scenes.map((s) => s.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "scene") {
      setDragItem({ type: "scene", sceneId: String(event.active.id) });
    } else if (data?.type === "shot") {
      setDragItem({
        type: "shot",
        sceneId: data.sceneId as string,
        shotId: String(event.active.id),
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragItem(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === "scene" && overData?.type === "scene") {
      reorderScenes(String(active.id), String(over.id));
      return;
    }

    if (activeData?.type === "shot") {
      const shotId = String(active.id);
      const fromSceneId = activeData.sceneId as string;

      if (overData?.type === "shot") {
        const toSceneId = overData.sceneId as string;
        const overShotId = String(over.id);
        if (fromSceneId === toSceneId) {
          moveShotWithinScene(fromSceneId, shotId, overShotId);
        } else {
          reorderShots(shotId, fromSceneId, toSceneId, overShotId);
        }
        return;
      }

      if (overData?.type === "scene-drop") {
        const toSceneId = overData.sceneId as string;
        if (fromSceneId === toSceneId) {
          const scene = project.scenes.find((sc) => sc.id === toSceneId);
          const shots = scene ? getSortedShots(scene) : [];
          const last = shots[shots.length - 1];
          if (last && last.id !== shotId) {
            moveShotWithinScene(fromSceneId, shotId, last.id);
          }
        } else {
          reorderShots(shotId, fromSceneId, toSceneId, null);
        }
      }
    }
  };

  const handleDragCancel = () => setDragItem(null);

  const targetSceneId = getLastSelectedSceneId();

  return (
    <div className="outliner">
      <div className="outliner-toolbar">
        <button type="button" onClick={() => addScene()}>
          + NEW SCENE
        </button>
        <button
          type="button"
          onClick={() => addShot(targetSceneId ?? undefined)}
          disabled={scenes.length === 0}
          title={
            scenes.length === 0
              ? "Add a scene first"
              : "Add shot to selected or last scene"
          }
        >
          + NEW SHOT
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={outlinerCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={sceneIds} strategy={verticalListSortingStrategy}>
          <div className="scene-list">
            {scenes.map((scene) => (
              <SortableSceneRow
                key={scene.id}
                scene={scene}
                project={project}
                selectedScene={
                  selection?.kind === "scene" && selection.sceneId === scene.id
                }
                selectedShotId={
                  selection?.kind === "shot" && selection.sceneId === scene.id
                    ? selection.shotId
                    : null
                }
                onSelectScene={() => selectScene(scene.id)}
                onSelectShot={(shotId) => selectShot(scene.id, shotId)}
                onUpdateScene={(patch) => updateScene(scene.id, patch)}
                onToggleShotVisible={(shotId, visible) =>
                  updateShot(scene.id, shotId, { visible })
                }
                onDeleteScene={() =>
                  setConfirm({
                    message: `Delete Scene ${scenes.findIndex((s) => s.id === scene.id) + 1} and all its shots?`,
                    onYes: () => deleteScene(scene.id),
                  })
                }
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          <DragOverlayPreview project={project} dragItem={dragItem} />
        </DragOverlay>
      </DndContext>

      {scenes.length === 0 && (
        <p className="outliner-empty">
          No scenes yet. Click + NEW SCENE to start.
        </p>
      )}
    </div>
  );
}
