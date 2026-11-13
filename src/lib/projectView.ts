/*
 * Where a project was left: page, zoom, page layout and the List/Table tab.
 * Saved with the project (and its autosave) so it reopens the same way.
 */
import type { Project } from "../model/types";
import type { ViewerLayoutMode } from "../types/viewerLayout";
import { usePrefsStore } from "../stores/prefsStore";
import { useSessionStore } from "../stores/sessionStore";

export type ProjectView = NonNullable<Project["view"]>;

/** The view right now. */
export function currentView(): ProjectView {
  const session = useSessionStore.getState();
  const prefs = usePrefsStore.getState();
  return { page: session.viewerPage, zoomPercent: prefs.viewerZoomPercent, layout: prefs.viewerLayoutMode, scenesView: session.scenesView };
}

/** The project with the current view recorded, for saving. */
export const withCurrentView = (project: Project): Project => {
  // Export choices live outside undo; they join the project when it is written out.
  const exportChoices = useSessionStore.getState().exportChoices;
  const hasChoices = Object.keys(exportChoices).length > 0;
  return {
    ...project,
    view: currentView(),
    settings: hasChoices ? { ...project.settings, exportChoices } : project.settings,
  };
};

/** Puts the view back after opening a project. */
export function restoreView(view: ProjectView | undefined): void {
  if (!view) return;
  const prefs = usePrefsStore.getState();
  const session = useSessionStore.getState();
  if (view.layout) prefs.setViewerLayoutMode(view.layout as ViewerLayoutMode);
  if (view.zoomPercent) prefs.setViewerZoomPercent(view.zoomPercent);
  if (view.scenesView) session.setScenesView(view.scenesView);
  if (view.page) {
    // After the pages have laid out at the restored zoom.
    setTimeout(() => {
      useSessionStore.getState().setViewerPage(view.page);
      useSessionStore.getState().setActivePage(view.page);
    }, 300);
  }
}
