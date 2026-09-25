const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DATE_CODES = ["mmmmm", "mmmm", "mmm", "mm", "m", "dddd", "ddd", "dd", "d", "yyyy", "yy"] as const;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

export function parseIsoDate(iso: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day, weekday: date.getDay() };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function renderCode(code: string, date: CalendarDate): string {
  switch (code) {
    case "yyyy":
      return String(date.year);
    case "yy":
      return pad2(date.year % 100);
    case "mmmmm":
      return MONTHS[date.month - 1]?.charAt(0) ?? "";
    case "mmmm":
      return MONTHS[date.month - 1] ?? "";
    case "mmm":
      return MONTHS_SHORT[date.month - 1] ?? "";
    case "mm":
      return pad2(date.month);
    case "m":
      return String(date.month);
    case "dddd":
      return WEEKDAYS[date.weekday] ?? "";
    case "ddd":
      return WEEKDAYS_SHORT[date.weekday] ?? "";
    case "dd":
      return pad2(date.day);
    case "d":
      return String(date.day);
    default:
      return "";
  }
}

function matchCode(rest: string): string | null {
  for (const code of DATE_CODES) {
    if (rest.startsWith(code)) return code;
  }
  return null;
}

/** Excel date codes. `m` is always the month. Quoted text is copied through. */
export function formatExcelDate(iso: string, pattern: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  let i = 0;
  let out = "";
  while (i < pattern.length) {
    if (pattern[i] === '"') {
      i += 1;
      let literal = "";
      while (i < pattern.length) {
        if (pattern[i] === '"') {
          if (pattern[i + 1] === '"') {
            literal += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        literal += pattern[i];
        i += 1;
      }
      out += literal;
      continue;
    }
    const code = matchCode(pattern.slice(i));
    if (code) {
      out += renderCode(code, date);
      i += code.length;
      continue;
    }
    out += pattern[i];
    i += 1;
  }
  return out;
}
