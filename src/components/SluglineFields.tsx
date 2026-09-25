import type { ReactNode } from "react";

export const SLUGLINE_PLACEHOLDERS = {
  indicator: "INT.",
  location: "LOCATION",
  timeOfDay: "DAY",
} as const;

type SlugPart = "indicator" | "location" | "timeOfDay";

const LABELS: Record<SlugPart, string> = {
  indicator: "Indicator",
  location: "Location",
  timeOfDay: "Time",
};

const PART_CLASS: Record<SlugPart, string> = {
  indicator: "slug-indicator",
  location: "slug-location",
  timeOfDay: "slug-time",
};

type Check = {
  checked: boolean;
  onToggle: (enabled: boolean) => void;
};

function FieldShell({
  part,
  label,
  check,
  showLabel,
  children,
}: {
  part: SlugPart;
  label: string;
  check?: Check;
  showLabel: boolean;
  children: ReactNode;
}) {
  if (check) {
    return (
      <div className={`include-field ${PART_CLASS[part]}`}>
        <label className="include-check">
          <input
            type="checkbox"
            checked={check.checked}
            onChange={(e) => check.onToggle(e.target.checked)}
          />
          {label}
        </label>
        {children}
      </div>
    );
  }
  return (
    <label className={`${PART_CLASS[part]} ${showLabel ? "field compact" : "slug-header-part"}`}>
      {showLabel ? label : null}
      {children}
    </label>
  );
}

export function SluglineFields({
  indicator,
  location,
  timeOfDay,
  placeholders,
  onChange,
  checks,
  header,
}: {
  indicator: string;
  location: string;
  timeOfDay: string;
  placeholders: { indicator: string; location: string; timeOfDay: string };
  onChange: (patch: Partial<Record<SlugPart, string>>) => void;
  checks?: Partial<Record<SlugPart, Check>>;
  header?: boolean;
}) {
  const values: Record<SlugPart, string> = { indicator, location, timeOfDay };
  const parts: SlugPart[] = ["indicator", "location", "timeOfDay"];
  return (
    <div
      className={`slugline-fields ${header ? "header" : "span-2"}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {parts.map((part) => (
        <FieldShell
          key={part}
          part={part}
          label={LABELS[part]}
          check={checks?.[part]}
          showLabel={!header}
        >
          <input
            type="text"
            value={values[part]}
            placeholder={placeholders[part]}
            aria-label={LABELS[part]}
            onChange={(e) => onChange({ [part]: e.target.value })}
          />
        </FieldShell>
      ))}
    </div>
  );
}
