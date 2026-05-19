import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

/**
 * Scenes and shots share one DndContext. Without filtering, dragging a shot
 * often "hits" the parent scene block instead of another shot row.
 */
export const outlinerCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;

  if (activeType === "shot") {
    const shotContainers = args.droppableContainers.filter(
      (container) => container.data.current?.type === "shot"
    );
    const shotHits = pointerWithin({ ...args, droppableContainers: shotContainers });
    if (shotHits.length > 0) return shotHits;

    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.data.current?.type === "scene-drop"
      ),
    });
  }
  if (activeType === "scene") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.data.current?.type === "scene"
      ),
    });
  }

  return closestCenter(args);
};
