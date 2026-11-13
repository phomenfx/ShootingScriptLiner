/*
 * Touch screens get bigger targets: handles and hit distances on the script
 * grow by this factor when the main pointer is a finger (or a pen on a
 * tablet). Mouse users see no change.
 */
let cached: boolean | null = null;

export function coarsePointer(): boolean {
  if (cached === null) {
    cached = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      window.matchMedia("(pointer: coarse)").addEventListener?.("change", (e) => (cached = e.matches));
    }
  }
  return cached;
}

/** 1 with a mouse; larger on touch screens. */
export const touchScale = (): number => (coarsePointer() ? 1.8 : 1);
