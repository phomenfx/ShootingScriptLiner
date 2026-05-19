import {
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  MAX_LINE_HIT_TOLERANCE_PX,
  MIN_LINE_HIT_TOLERANCE_PX,
} from "../types/appPreferences";

const STORAGE_KEY = "shooting-script-liner-line-hit-tolerance";

export function clampLineHitTolerancePx(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LINE_HIT_TOLERANCE_PX;
  return Math.round(Math.max(MIN_LINE_HIT_TOLERANCE_PX, Math.min(MAX_LINE_HIT_TOLERANCE_PX, n)));
}

export function loadLineHitTolerancePx(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_LINE_HIT_TOLERANCE_PX;
    return clampLineHitTolerancePx(Number(raw));
  } catch {
    return DEFAULT_LINE_HIT_TOLERANCE_PX;
  }
}

export function saveLineHitTolerancePx(px: number): void {
  localStorage.setItem(STORAGE_KEY, String(clampLineHitTolerancePx(px)));
}
