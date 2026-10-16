/*
Created at: 2026-10-11 02:14
Updated at: 2026-10-11 02:35
Description: Display formatting helpers for GozilaSim ID: devices, dates, relative time, time zones, phone numbers, and file sizes.
*/

// ###############################################
// Device Summaries
// ###############################################

export type DeviceKind = "desktop" | "mobile" | "unknown";

export type DeviceSummary = {
  browser: string | null;
  system: string | null;
  kind: DeviceKind;
};

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"]
];

const SYSTEM_PATTERNS: Array<[RegExp, string, DeviceKind]> = [
  [/iPhone/, "iPhone", "mobile"],
  [/iPad/, "iPad", "mobile"],
  [/Android/, "Android", "mobile"],
  [/Windows/, "Windows", "desktop"],
  [/Mac OS X|Macintosh/, "macOS", "desktop"],
  [/CrOS/, "ChromeOS", "desktop"],
  [/Linux/, "Linux", "desktop"]
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceSummary {
  if (!userAgent) return { browser: null, system: null, kind: "unknown" };
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const system = SYSTEM_PATTERNS.find(([pattern]) => pattern.test(userAgent));
  return {
    browser,
    system: system?.[1] ?? null,
    kind: system?.[2] ?? "unknown"
  };
}

export function deviceName(userAgent: string | null | undefined, deviceLabel: string | null | undefined, fallback: string) {
  const summary = describeUserAgent(userAgent);
  const parts = [summary.browser, summary.system].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return deviceLabel?.trim() || fallback;
}

// ###############################################
// Dates And Times
// ###############################################

function capitalize(value: string) {
  return value ? value[0].toLocaleUpperCase() + value.slice(1) : value;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// "Today 1:04 AM", "Yesterday 6:24 PM", then a short date for anything older.
export function formatDayTime(value: string, locale: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const dayDifference = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (dayDifference === 0 || dayDifference === -1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(dayDifference, "day");
    return `${capitalize(day)} ${time}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(locale, { dateStyle: "medium" });
}

// "now", "5 minutes ago", "3 days ago", then a short date once it is more than a month old.
export function formatRelativeTime(value: string, locale: string, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const elapsed = Math.abs(seconds);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < 45) return relative.format(0, "second");
  if (elapsed < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (elapsed < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  if (elapsed < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
  return date.toLocaleDateString(locale, { dateStyle: "medium" });
}

// Formats a date-only value such as "1998-03-12" without shifting it across time zones.
export function formatCalendarDate(value: string, locale: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(locale, { dateStyle: "long" });
}

export function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// ###############################################
// Time Zones
// ###############################################

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland"
];

export function listTimeZones(): string[] {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  try {
    const zones = supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {
    // Older browsers fall back to the short list below.
  }
  return FALLBACK_TIME_ZONES;
}

export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function timeZoneOffset(timeZone: string, date = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

// "Asia/Kuala Lumpur (GMT+8)"; the raw zone name is returned when the browser does not know it.
export function timeZoneLabel(timeZone: string) {
  const offset = timeZoneOffset(timeZone);
  const name = timeZone.replace(/_/g, " ");
  return offset ? `${name} (${offset})` : name;
}

export function formatNowInTimeZone(timeZone: string, locale: string): string | null {
  try {
    return new Date().toLocaleString(locale, { timeZone, dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

// ###############################################
// Phone Numbers
// ###############################################

export const DIAL_CODES: Array<{ code: string; region: string }> = [
  { code: "+60", region: "MY" },
  { code: "+65", region: "SG" },
  { code: "+86", region: "CN" },
  { code: "+852", region: "HK" },
  { code: "+853", region: "MO" },
  { code: "+886", region: "TW" },
  { code: "+81", region: "JP" },
  { code: "+82", region: "KR" },
  { code: "+91", region: "IN" },
  { code: "+62", region: "ID" },
  { code: "+66", region: "TH" },
  { code: "+84", region: "VN" },
  { code: "+63", region: "PH" },
  { code: "+61", region: "AU" },
  { code: "+64", region: "NZ" },
  { code: "+1", region: "US" },
  { code: "+44", region: "GB" },
  { code: "+33", region: "FR" },
  { code: "+49", region: "DE" },
  { code: "+39", region: "IT" },
  { code: "+34", region: "ES" },
  { code: "+31", region: "NL" },
  { code: "+7", region: "RU" },
  { code: "+971", region: "AE" },
  { code: "+966", region: "SA" },
  { code: "+55", region: "BR" },
  { code: "+52", region: "MX" },
  { code: "+27", region: "ZA" },
  { code: "+234", region: "NG" },
  { code: "+20", region: "EG" }
];

export function dialCodeLabel(code: string, region: string, locale: string) {
  try {
    const name = new Intl.DisplayNames(locale, { type: "region" }).of(region);
    // The code leads so it stays visible when a narrow select cuts the label short.
    return name ? `${code} ${name}` : code;
  } catch {
    return `${code} ${region}`;
  }
}

// Guesses a starting dial code from the browser region, e.g. "en-MY" -> "+60".
export function defaultDialCode() {
  const languages = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  for (const language of languages) {
    const region = language.split("-")[1]?.toUpperCase();
    const match = DIAL_CODES.find((item) => item.region === region);
    if (match) return match.code;
  }
  return "+1";
}

// An empty dial code means "other": the number field then holds the full international number.
export function splitPhoneNumber(value: string | null | undefined): { dialCode: string; number: string } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { dialCode: defaultDialCode(), number: "" };
  if (trimmed.startsWith("+")) {
    const match = [...DIAL_CODES]
      .sort((first, second) => second.code.length - first.code.length)
      .find((item) => trimmed.startsWith(item.code));
    if (match) return { dialCode: match.code, number: trimmed.slice(match.code.length).trim() };
  }
  return { dialCode: "", number: trimmed };
}

export function joinPhoneNumber(dialCode: string, number: string): string | null {
  const trimmed = number.trim();
  if (!trimmed) return null;
  return dialCode ? `${dialCode} ${trimmed}` : trimmed;
}

export function isValidPhoneNumber(dialCode: string, number: string) {
  const joined = joinPhoneNumber(dialCode, number);
  if (!joined) return false;
  if (!/^\+?[\d\s()-]+$/.test(joined)) return false;
  const digits = joined.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

// ###############################################
// File Sizes
// ###############################################

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
