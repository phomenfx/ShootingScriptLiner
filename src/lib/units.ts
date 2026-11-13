/*
 * Lengths are stored in PDF points; the forms can show them in points, inches
 * or millimeters (Settings > Appearance). Font sizes always stay in points.
 */
export type LengthUnit = "pt" | "in" | "mm";

const POINTS_PER: Record<LengthUnit, number> = { pt: 1, in: 72, mm: 72 / 25.4 };
const DECIMALS: Record<LengthUnit, number> = { pt: 2, in: 3, mm: 2 };

/** A length in points, shown in the unit (rounded for display). */
export function fromPoints(pt: number, unit: LengthUnit): number {
  const factor = 10 ** DECIMALS[unit];
  return Math.round((pt / POINTS_PER[unit]) * factor) / factor;
}

/** A typed length back to points. */
export const toPoints = (value: number, unit: LengthUnit): number => value * POINTS_PER[unit];

/** The step for a length field: the points step for points, else a sensible small step. */
export const lengthStep = (ptStep: number, unit: LengthUnit): number => (unit === "pt" ? ptStep : unit === "in" ? 0.01 : 0.1);

export const isLengthUnit = (value: unknown): value is LengthUnit => value === "pt" || value === "in" || value === "mm";
