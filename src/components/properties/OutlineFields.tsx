import type { Outline } from "../../model/types";
import { useProjectStore } from "../../stores/projectStore";
import { ColorField, Field, NumberInput } from "./parts";

/** A white halo reads well on a script page. */
export const DEFAULT_OUTLINE: Outline = { color: "#FFFFFF", widthPt: 1.5 };

/**
 * On/off, color and width for one outline. Turning it on starts from the
 * project's default outline (Settings → Mark defaults), or white.
 */
export function OutlineFields({ label, value, onChange }: { label: string; value: Outline | undefined; onChange: (outline: Outline | undefined) => void }) {
  const fallback = useProjectStore(
    (s) => s.project.settings.markDefaults.shape.outline ?? s.project.settings.markDefaults.line.outline ?? DEFAULT_OUTLINE
  );
  return (
    <>
      <Field label={label} wide>
        <label className="pf-check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? { ...(value ?? fallback) } : undefined)} />
          {value ? "On" : "Off"}
        </label>
      </Field>
      {value && (
        <>
          <Field label="Color">
            <ColorField label={`${label} color`} color={value.color} onChange={(color) => onChange({ ...value, color })} />
          </Field>
          <Field label="Width">
            <NumberInput
              label={`${label} width`}
              value={value.widthPt}
              min={0.25}
              max={6}
              step={0.25}
              unit="len"
              onChange={(widthPt) => widthPt && onChange({ ...value, widthPt })}
            />
          </Field>
        </>
      )}
    </>
  );
}
