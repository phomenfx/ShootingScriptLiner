import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SHOT_LINK_MIME } from "../../lib/fonts";
import { formatShotLabel } from "../../lib/labelUtils";
import type {
  AdditionalInfoStyle,
  LabelMode,
  Scene,
  Shot,
} from "../../types/project";
import { VisibilityToggle } from "../VisibilityToggle";

type Props = {
  scene: Scene;
  shot: Shot;
  scenes: Scene[];
  labelMode: LabelMode;
  additionalInfoStyle: AdditionalInfoStyle;
  selected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
};

export function SortableShotRow({
  scene,
  shot,
  scenes,
  labelMode,
  additionalInfoStyle,
  selected,
  onSelect,
  onToggleVisible,
}: Props) {
  const { active } = useDndContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: shot.id,
      data: { type: "shot" as const, sceneId: scene.id, shotId: shot.id },
      animateLayoutChanges: () => false,
    });

  // Smooth shift while dragging; instant snap when released (no settle animation)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: active && !isDragging ? transition : undefined,
  };

  const label = formatShotLabel(
    scene,
    shot,
    scenes,
    labelMode,
    additionalInfoStyle
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shot-row ${selected ? "selected" : ""} ${isDragging ? "is-dragging" : ""}`}
      onClick={onSelect}
    >
      <span className="drag-handle" {...attributes} {...listeners}>
        ≡
      </span>
      <VisibilityToggle
        visible={shot.visible}
        onToggle={onToggleVisible}
        label={label}
      />
      <span
        className="shot-label shot-label-draggable"
        style={{ color: shot.color }}
        draggable
        title="Drag onto Properties to link a line"
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData(
            SHOT_LINK_MIME,
            JSON.stringify({ sceneId: scene.id, shotId: shot.id })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
      >
        {label}
      </span>
    </div>
  );
}
