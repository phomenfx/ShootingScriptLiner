import {
  formatShotLabel,
  sceneNumber,
} from "../../lib/labelUtils";
import type { Project } from "../../types/project";

type DragItem =
  | { type: "scene"; sceneId: string }
  | { type: "shot"; sceneId: string; shotId: string };

type Props = {
  project: Project;
  dragItem: DragItem | null;
};

export function DragOverlayPreview({ project, dragItem }: Props) {
  if (!dragItem) return null;

  if (dragItem.type === "scene") {
    const scene = project.scenes.find((s) => s.id === dragItem.sceneId);
    if (!scene) return null;
    const num = sceneNumber(scene, project.scenes);
    const title = scene.slugline.trim()
      ? `Scene ${num} - ${scene.slugline}`
      : `Scene ${num}`;
    return (
      <div className="drag-overlay-preview drag-overlay-preview--scene">
        {title}
      </div>
    );
  }

  const scene = project.scenes.find((s) => s.id === dragItem.sceneId);
  const shot = scene?.shots.find((sh) => sh.id === dragItem.shotId);
  if (!scene || !shot) return null;

  const label = formatShotLabel(
    scene,
    shot,
    project.scenes,
    project.labelMode,
    project.additionalInfoStyle
  );

  return (
    <div
      className="drag-overlay-preview drag-overlay-preview--shot"
      style={{ color: shot.color }}
    >
      {label}
    </div>
  );
}
