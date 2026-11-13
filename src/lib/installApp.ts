/*
 * Installable app: registers the offline service worker in the published
 * build, and keeps the browser's install offer so the File menu can show
 * "Install app…" where the browser supports it.
 */
import { useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function startInstallSupport(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the offer for the menu instead of the browser's own banner.
    e.preventDefault();
    offer = e as InstallPrompt;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    changed();
  });
  // Service workers need https (or localhost); the portable file:// build runs without one.
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (import.meta.env.PROD && secure && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  }
}

/** Whether the browser is offering to install the app right now. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => offer !== null,
    () => false
  );
}

export async function installApp(): Promise<void> {
  if (!offer) return;
  await offer.prompt();
  await offer.userChoice.catch(() => undefined);
  offer = null;
  changed();
}
