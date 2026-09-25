import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getSortedShots, sceneNumber } from "../../lib/labelUtils";
import type { Project, Scene } from "../../types/project";
import { SluglineFields, SLUGLINE_PLACEHOLDERS } from "../SluglineFields";
import { VisibilityToggle } from "../VisibilityToggle";
import { SortableShotRow } from "./SortableShotRow";

type Props = {
  scene: Scene;
  project: Project;
  selectedScene: boolean;
  selectedShotId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectScene: () => void;
  onSelectShot: (shotId: string) => void;
  onUpdateScene: (
    patch: Partial<Pick<Scene, "indicator" | "location" | "timeOfDay" | "visible">>
  ) => void;
  onToggleShotVisible: (shotId: string, visible: boolean) => void;
  onDeleteScene: () => void;
};

export function SortableSceneRow({
  scene,
  project,
  selectedScene,
  selectedShotId,
  collapsed,
  onToggleCollapsed,
  onSelectScene,
  onSelectShot,
  onUpdateScene,
  onToggleShotVisible,
  onDeleteScene,
}: Props) {
  const num = sceneNumber(scene, project.scenes);
  const shots = getSortedShots(scene);
  const shotIds = shots.map((s) => s.id);

  const { active } = useDndContext();
  const draggingShot = active?.data.current?.type === "shot";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: scene.id,
      data: { type: "scene" as const, sceneId: scene.id },
      animateLayoutChanges: () => false,
      disabled: draggingShot,
    });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `scene-drop-${scene.id}`,
    data: { type: "scene-drop" as const, sceneId: scene.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: active && !isDragging ? transition : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`scene-block ${selectedScene ? "selected" : ""} ${isOver ? "drop-over" : ""} ${isDragging ? "is-dragging" : ""} ${collapsed ? "collapsed" : ""}`}
    >
      <div
        className="scene-header"
        onClick={onSelectScene}
        ref={collapsed ? setDropRef : undefined}
      >
        <button
          type="button"
          className="fold-btn"
          title={collapsed ? "Expand scene" : "Collapse scene"}
          aria-label={collapsed ? `Expand Scene ${num}` : `Collapse Scene ${num}`}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <span className="drag-handle" {...attributes} {...listeners}>
          ≡
        </span>
        <VisibilityToggle
          visible={scene.visible}
          onToggle={() => onUpdateScene({ visible: !scene.visible })}
          label={`Scene ${num}`}
        />
        <span className="scene-number">Scene {num}</span>
        {collapsed && (
          <span className="scene-shot-count" title={`${shots.length} shots`}>
            ({shots.length})
          </span>
        )}
        <SluglineFields
          header
          indicator={scene.indicator ?? ""}
          location={scene.location ?? ""}
          timeOfDay={scene.timeOfDay ?? ""}
          placeholders={SLUGLINE_PLACEHOLDERS}
          onChange={(patch) => onUpdateScene(patch)}
        />
        <button
          type="button"
          className="btn-icon"
          title="Delete scene"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteScene();
          }}
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <div ref={setDropRef} className="shot-list">
          <SortableContext items={shotIds} strategy={verticalListSortingStrategy}>
            {shots.map((shot) => (
              <SortableShotRow
                key={shot.id}
                scene={scene}
                shot={shot}
                scenes={project.scenes}
                labelMode={project.labelMode}
                additionalInfoStyle={project.additionalInfoStyle}
                selected={selectedShotId === shot.id}
                onSelect={() => onSelectShot(shot.id)}
                onToggleVisible={() =>
                  onToggleShotVisible(shot.id, !shot.visible)
                }
              />
            ))}
          </SortableContext>
          {shots.length === 0 && (
            <p className="empty-scene-hint">Empty scene - add shots below</p>
          )}
        </div>
      )}
    </div>
  );
}
