/*
Created at: 2026-05-11 01:17
Updated at: 2026-10-11 12:37
Description: Main GozilaSim ID React UI for authentication, profile, launcher, legal, and sign-in protection screens.
*/

// ###############################################
// Imports
// ###############################################

import {
  createContext,
  FormEvent,
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import { api, ApiError } from "./api";
import { useAnimatedHeight } from "./authFields";
import {
  browserTimeZone,
  describeUserAgent,
  deviceName,
  DIAL_CODES,
  dialCodeLabel,
  formatCalendarDate,
  formatDayTime,
  formatFileSize,
  formatNowInTimeZone,
  formatRelativeTime,
  isValidPhoneNumber,
  joinPhoneNumber,
  listTimeZones,
  splitPhoneNumber,
  timeZoneLabel,
  todayIsoDate
} from "./format";
import logoMarkSrc from "./assets/gozilasim-logo.png";
import {
  labelForLocale,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  localeForLanguage,
  resolveSupportedLanguage,
  translate,
  type SupportedLanguage,
  type TranslationKey
} from "./i18n";
import { fillLegalContact, LEGAL_COPY, LEGAL_LAST_UPDATED, LEGAL_ROUTES, type LegalRoute } from "./legalContent";
import { Modal, MOTION_FAST_MS, prefersReducedMotion, useDismissLayer, useMotionPresence, useOutsideClick } from "./overlay";
import type {
  AuthorizeContext,
  AvatarHistoryItem,
  ConnectedApp,
  DataSummary,
  DeleteConfirmation,
  GenderValue,
  LauncherApp,
  LoginResponse,
  MfaMethod,
  MfaSetup,
  ProfilePromptField,
  ProfileUpdatePayload,
  ResetPasswordInspectResponse,
  SecurityEvent,
  SessionInfo,
  User
} from "./types";

// ###############################################
// Product Constants
// ###############################################

const PRODUCT_NAME = "GozilaSim ID";
const FALLBACK_INITIALS = "GS";
const THEME_STORAGE_KEY = "gozilasim.theme.v1";
const LOGIN_BACKGROUND_STORAGE_KEY = "gozilasim.loginBackground.v1";
const REMEMBERED_EMAIL_STORAGE_KEY = "gozilasim.rememberedEmail.v1";
const DEFAULT_LOGIN_BACKGROUND_SRC = "/backgrounds/26011-353916142_medium.mp4";
// Stored in place of a video path when the wallpaper should stay still.
const LOGIN_BACKGROUND_NONE = "none";
const LOGIN_BACKGROUND_OPTIONS: Array<{ id: string; src: string }> = [
  { id: "background-default", src: DEFAULT_LOGIN_BACKGROUND_SRC },
  { id: "background-131997", src: "/backgrounds/131997-751915329_medium.mp4" },
  { id: "background-153957", src: "/backgrounds/153957-806571952_medium.mp4" },
  { id: "background-20072", src: "/backgrounds/20072-307163785_medium.mp4" },
  { id: "background-202587", src: "/backgrounds/202587-918431513_medium.mp4" },
  { id: "background-35573", src: "/backgrounds/35573-407595474_medium.mp4" },
  { id: "background-5194", src: "/backgrounds/5194-183786499_medium.mp4" }
];

const GENDER_OPTIONS: Array<{ value: GenderValue; labelKey: TranslationKey }> = [
  { value: "male", labelKey: "gender.male" },
  { value: "female", labelKey: "gender.female" },
  { value: "non_binary", labelKey: "gender.nonBinary" },
  { value: "prefer_not_to_say", labelKey: "gender.preferNot" },
  { value: "custom", labelKey: "gender.custom" }
];

const AVATAR_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// These mirror the backend defaults. The server stays the authority, and its own message is shown when they differ.
const AVATAR_MAX_BYTES = Number(import.meta.env.VITE_AVATAR_MAX_BYTES) || 5 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = Number(import.meta.env.VITE_PASSWORD_MIN_LENGTH) || 8;
const VERIFICATION_CODE_LENGTH = 6;
const BACKUP_CODE_LENGTH = 8;
const ONBOARDING_SNOOZE_STORAGE_KEY = "gozilasim.onboardingSnoozed.v1";

// ###############################################
// Routing Helpers
// ###############################################

type Route = "login" | "register" | "forgot-password" | "reset-password" | "profile-onboarding" | "authorize" | "account" | "profile" | "profile-edit" | "security" | "data-privacy" | "connected-apps" | LegalRoute;
type ConsoleRoute = Extract<Route, "account" | "profile" | "security" | "data-privacy" | "connected-apps">;
type AuthenticatedHandler = (user: User) => void;
type ProfileEditField = "name" | "gender" | "email" | "phone" | "birthday" | "language" | "timezone";
type SecuritySection = "activity" | "password" | "verification" | "backup-codes" | "recovery-email" | "sessions";
type ThemeField = "background" | "surface" | "surfaceMuted" | "text" | "mutedText" | "accent";
type ThemeSettings = Record<ThemeField, string>;

const CONSOLE_NAV: Array<{
  route: ConsoleRoute;
  label: string;
  icon: ConsoleIconName;
  tone: "blue" | "green" | "cyan";
}> = [
  { route: "account", label: "Home", icon: "home", tone: "blue" },
  { route: "profile", label: "Personal info", icon: "profile", tone: "green" },
  { route: "security", label: "Security and sign-in", icon: "security", tone: "cyan" },
  { route: "data-privacy", label: "Data and privacy", icon: "data", tone: "blue" },
  { route: "connected-apps", label: "Connected apps", icon: "apps", tone: "green" }
];

const PROFILE_EDIT_FIELDS: ProfileEditField[] = ["name", "gender", "email", "phone", "birthday", "language", "timezone"];
const SECURITY_SECTIONS: SecuritySection[] = ["activity", "password", "verification", "backup-codes", "recovery-email", "sessions"];

const DEFAULT_THEME: ThemeSettings = {
  background: "#202124",
  surface: "#303134",
  surfaceMuted: "#3c4043",
  text: "#f1f3f4",
  mutedText: "#bdc1c6",
  accent: "#8ab4f8"
};

const THEME_FIELDS: Array<{ key: ThemeField; labelKey: TranslationKey; descriptionKey: TranslationKey }> = [
  { key: "background", labelKey: "theme.fieldBackground", descriptionKey: "theme.fieldBackgroundDesc" },
  { key: "surface", labelKey: "theme.fieldSurface", descriptionKey: "theme.fieldSurfaceDesc" },
  { key: "surfaceMuted", labelKey: "theme.fieldSurfaceMuted", descriptionKey: "theme.fieldSurfaceMutedDesc" },
  { key: "text", labelKey: "theme.fieldText", descriptionKey: "theme.fieldTextDesc" },
  { key: "mutedText", labelKey: "theme.fieldMutedText", descriptionKey: "theme.fieldMutedTextDesc" },
  { key: "accent", labelKey: "theme.fieldAccent", descriptionKey: "theme.fieldAccentDesc" }
];

const THEME_PRESETS: Array<{ id: string; labelKey: TranslationKey; theme: ThemeSettings }> = [
  { id: "dark", labelKey: "theme.presetDark", theme: DEFAULT_THEME },
  {
    id: "light",
    labelKey: "theme.presetLight",
    theme: { background: "#f8f9fa", surface: "#ffffff", surfaceMuted: "#e8eaed", text: "#202124", mutedText: "#5f6368", accent: "#1a73e8" }
  },
  {
    id: "midnight",
    labelKey: "theme.presetMidnight",
    theme: { background: "#0b1220", surface: "#131c2e", surfaceMuted: "#1d2940", text: "#e6edf7", mutedText: "#9fb0c8", accent: "#7cb7ff" }
  }
];

// Event types the backend records today. Anything newer falls back to a readable form of its code.
const SECURITY_EVENT_LABELS: Record<string, TranslationKey> = {
  login_success: "event.loginSuccess",
  login_failed: "event.loginFailed",
  logout: "event.logout",
  password_changed: "event.passwordChanged",
  password_reset: "event.passwordReset",
  mfa_enabled: "event.mfaEnabled",
  mfa_disabled: "event.mfaDisabled",
  profile_updated: "event.profileUpdated",
  avatar_updated: "event.avatarUpdated",
  session_revoked: "event.sessionRevoked",
  onboarding_completed: "event.onboardingCompleted",
  backup_codes_generated: "event.backupCodesGenerated",
  backup_code_used: "event.backupCodeUsed",
  recovery_email_added: "event.recoveryEmailAdded",
  recovery_email_removed: "event.recoveryEmailRemoved",
  recovery_email_used: "event.recoveryEmailUsed",
  email_verified: "event.emailVerified",
  app_access_granted: "event.appAccessGranted",
  app_access_removed: "event.appAccessRemoved",
  data_exported: "event.dataExported"
};

// ###############################################
// Language Helpers
// ###############################################

type I18nContextValue = {
  language: SupportedLanguage;
  locale: string;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatDateTime: (value: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function loadStoredLanguage(): SupportedLanguage {
  try {
    return resolveSupportedLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "en";
  }
}

function saveStoredLanguage(language: SupportedLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, localeForLanguage(language));
  } catch {
    // localStorage may be unavailable in strict browser modes.
  }
}

function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("I18n context is not available.");
  }
  return context;
}

// ###############################################
// App Chrome Context
// ###############################################

// Actions any screen can trigger. The profile picture and appearance dialogs they open live once at the app root.
type ChromeContextValue = {
  setUser: (user: User) => void;
  openPictureModal: () => void;
  openAppearance: () => void;
  logout: () => void;
  // Called once the server has deleted the account: the session is gone, so the app returns to sign-in.
  accountDeleted: () => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

function useChrome() {
  const context = useContext(ChromeContext);
  if (!context) {
    throw new Error("Chrome context is not available.");
  }
  return context;
}

// ###############################################
// Route Functions
// ###############################################

function getRoute(): Route {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (
    isLegalRoute(path) ||
    path === "register" ||
    path === "forgot-password" ||
    path === "reset-password" ||
    path === "profile-onboarding" ||
    path === "authorize" ||
    path === "profile-edit" ||
    path === "profile" ||
    path === "security" ||
    path === "data-privacy" ||
    path === "connected-apps" ||
    path === "account"
  ) return path;
  return "login";
}

function go(path: Route) {
  window.history.pushState({}, "", `/${path}`);
  window.scrollTo({ top: 0, left: 0 });
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// For in-app links that carry a query string, such as "/security?section=password".
function goPath(path: string) {
  window.history.pushState({}, "", path);
  window.scrollTo({ top: 0, left: 0 });
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function replaceRoute(path: Route) {
  window.history.replaceState({}, "", `/${path}`);
  window.scrollTo({ top: 0, left: 0 });
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function goProfileEdit(field: ProfileEditField) {
  window.history.pushState({}, "", `/profile-edit?field=${field}`);
  window.scrollTo({ top: 0, left: 0 });
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function goSecuritySection(section: SecuritySection) {
  window.history.pushState({}, "", `/security?section=${section}`);
  window.scrollTo({ top: 0, left: 0 });
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Only web addresses are followed after sign-in, so a crafted ?next= value can never run a script URL.
function nextUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return null;
  try {
    return /^https?:$/.test(new URL(next, window.location.origin).protocol) ? next : null;
  } catch {
    return null;
  }
}

function resetToken() {
  return new URLSearchParams(window.location.search).get("token");
}

function profileEditField(): ProfileEditField {
  const field = new URLSearchParams(window.location.search).get("field");
  return PROFILE_EDIT_FIELDS.includes(field as ProfileEditField) ? field as ProfileEditField : "name";
}

function securitySectionFromUrl(): SecuritySection | null {
  const section = new URLSearchParams(window.location.search).get("section");
  return SECURITY_SECTIONS.includes(section as SecuritySection) ? section as SecuritySection : null;
}

function profileEditTitle(field: ProfileEditField, t: I18nContextValue["t"]) {
  const titleByField: Record<ProfileEditField, string> = {
    name: t("common.name"),
    gender: t("common.gender"),
    email: t("common.email"),
    phone: t("common.phone"),
    birthday: t("common.birthday"),
    language: t("common.language"),
    timezone: t("common.timezone")
  };
  return titleByField[field];
}

function parseAuthorizeRequest(next: string | null) {
  if (!next) return null;
  try {
    const authorizeUrl = new URL(next, window.location.origin);
    const clientId = authorizeUrl.searchParams.get("client_id");
    const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
    const scope = authorizeUrl.searchParams.get("scope") ?? "openid";
    if (!clientId || !redirectUri) return null;
    return {
      next,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: authorizeUrl.searchParams.get("state")
    };
  } catch {
    return null;
  }
}

function oauthScopeLabel(scope: string, t: I18nContextValue["t"]) {
  if (scope === "openid") return t("oauth.scopeOpenid");
  if (scope === "email") return t("oauth.scopeEmail");
  if (scope === "profile") return t("oauth.scopeProfile");
  if (scope === "phone") return t("oauth.scopePhone");
  if (scope === "offline_access") return t("oauth.scopeOffline");
  return humanize(scope);
}

function oauthScopeIcon(scope: string): SettingIconName {
  if (scope === "email") return "mail";
  if (scope === "profile") return "user";
  if (scope === "phone") return "phone";
  if (scope === "offline_access") return "clock";
  return "id";
}

// Sends the person back to the requesting app with the standard "access denied" answer.
function authorizeDenyUrl(request: { redirect_uri: string; state: string | null }) {
  const url = new URL(request.redirect_uri);
  url.searchParams.set("error", "access_denied");
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

function navigateWithNext(path: Route, next: string | null) {
  window.location.href = next ? `/${path}?next=${encodeURIComponent(next)}` : `/${path}`;
}

function userInitials(user: User | null) {
  if (!user) return FALLBACK_INITIALS;
  return user.display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || user.email[0].toUpperCase();
}

function isLegalRoute(value: string): value is LegalRoute {
  return LEGAL_ROUTES.includes(value as LegalRoute);
}

function appInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "APP";
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function displayValue(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() || fallback;
}

function formatDateTime(value: string, language: SupportedLanguage = resolveSupportedLanguage(document.documentElement.lang)) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeForLanguage(language), {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function securityEventLabel(eventType: string, t: I18nContextValue["t"]) {
  const key = SECURITY_EVENT_LABELS[eventType];
  return key ? t(key) : humanize(eventType);
}

// Events about an app name the app when the server recorded which one it was.
function securityEventTitle(event: SecurityEvent, t: I18nContextValue["t"]) {
  const appName = event.metadata?.app_name;
  if (typeof appName === "string" && appName) {
    if (event.event_type === "app_access_granted") return t("event.appAccessGrantedNamed", { app: appName });
    if (event.event_type === "app_access_removed") return t("event.appAccessRemovedNamed", { app: appName });
  }
  return securityEventLabel(event.event_type, t);
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 429) return tooManyAttemptsMessage(error);
  return error instanceof ApiError ? error.message : fallback;
}

// Shown when the server has locked sign-in after repeated failures. It names the time the lock ends.
function tooManyAttemptsMessage(error: ApiError) {
  const language = resolveSupportedLanguage(document.documentElement.lang);
  if (!error.retryAfterSeconds) return translate(language, "auth.tooManyAttemptsLater");
  const unlocksAt = new Date(Date.now() + error.retryAfterSeconds * 1000);
  const time = unlocksAt.toLocaleTimeString(localeForLanguage(language), { hour: "numeric", minute: "2-digit" });
  return translate(language, "auth.tooManyAttempts", { time });
}

function genderLabel(value: string | null, t: I18nContextValue["t"]) {
  if (!value) return t("common.notSet");
  const option = GENDER_OPTIONS.find((item) => item.value === value);
  return option ? t(option.labelKey) : humanize(value);
}

const CONSOLE_NAV_LABELS: Record<ConsoleRoute, { full: TranslationKey; short: TranslationKey }> = {
  account: { full: "nav.home", short: "mobile.navAccount" },
  profile: { full: "nav.personalInfo", short: "mobile.navProfile" },
  security: { full: "nav.security", short: "mobile.navSecurity" },
  "data-privacy": { full: "nav.dataPrivacy", short: "mobile.navData" },
  "connected-apps": { full: "nav.connectedApps", short: "mobile.navApps" }
};

function consoleNavLabel(route: ConsoleRoute, t: I18nContextValue["t"]) {
  return t(CONSOLE_NAV_LABELS[route].full);
}

// The bottom bar on a phone has room for one short word per item.
function mobileNavLabel(route: ConsoleRoute, t: I18nContextValue["t"]) {
  return t(CONSOLE_NAV_LABELS[route].short);
}

function fullName(user: User) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
}

function primaryLanguage(user: User, emptyLabel: string) {
  return labelForLocale(user.locale, emptyLabel);
}

// ###############################################
// Theme Helpers
// ###############################################

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeTheme(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object") return DEFAULT_THEME;
  const record = value as Partial<Record<ThemeField, unknown>>;
  return {
    background: isHexColor(record.background) ? record.background : DEFAULT_THEME.background,
    surface: isHexColor(record.surface) ? record.surface : DEFAULT_THEME.surface,
    surfaceMuted: isHexColor(record.surfaceMuted) ? record.surfaceMuted : DEFAULT_THEME.surfaceMuted,
    text: isHexColor(record.text) ? record.text : DEFAULT_THEME.text,
    mutedText: isHexColor(record.mutedText) ? record.mutedText : DEFAULT_THEME.mutedText,
    accent: isHexColor(record.accent) ? record.accent : DEFAULT_THEME.accent
  };
}

function loadThemeSettings(): ThemeSettings {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const theme = stored ? normalizeTheme(JSON.parse(stored)) : DEFAULT_THEME;
    return isReadableTheme(theme) ? theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function saveThemeSettings(theme: ThemeSettings) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Theme storage is best-effort and should never block account usage.
  }
}

// ###############################################
// Login Background Helpers
// ###############################################

function isLoginBackgroundSrc(value: unknown): value is string {
  return typeof value === "string" && (value === LOGIN_BACKGROUND_NONE || LOGIN_BACKGROUND_OPTIONS.some((option) => option.src === value));
}

function loadLoginBackgroundSrc() {
  try {
    const stored = window.localStorage.getItem(LOGIN_BACKGROUND_STORAGE_KEY);
    return isLoginBackgroundSrc(stored) ? stored : DEFAULT_LOGIN_BACKGROUND_SRC;
  } catch {
    return DEFAULT_LOGIN_BACKGROUND_SRC;
  }
}

function saveLoginBackgroundSrc(src: string) {
  if (!isLoginBackgroundSrc(src)) return;
  try {
    window.localStorage.setItem(LOGIN_BACKGROUND_STORAGE_KEY, src);
  } catch {
    // Background selection is browser-local and best-effort.
  }
}

// ###############################################
// Remembered Email Helpers
// ###############################################

function loadRememberedEmail() {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) {
      window.localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, email);
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
    }
  } catch {
    // Remembering the email is browser-local and best-effort.
  }
}

// ###############################################
// Theme Color Helpers
// ###############################################

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function accentContrast(hex: string) {
  return contrastRatio(hex, "#172033") >= contrastRatio(hex, "#ffffff") ? "#172033" : "#ffffff";
}

function sameTheme(first: ThemeSettings, second: ThemeSettings) {
  return THEME_FIELDS.every((field) => first[field.key].toLowerCase() === second[field.key].toLowerCase());
}

// Text has to stay legible on every surface it can sit on; anything below these ratios is refused.
function isReadableTheme(theme: ThemeSettings) {
  return (
    contrastRatio(theme.text, theme.background) >= 4.5 &&
    contrastRatio(theme.text, theme.surface) >= 4.5 &&
    contrastRatio(theme.text, theme.surfaceMuted) >= 3 &&
    contrastRatio(theme.mutedText, theme.background) >= 3 &&
    contrastRatio(theme.mutedText, theme.surface) >= 3
  );
}

function applyThemeSettings(theme: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--theme-bg", theme.background);
  root.style.setProperty("--theme-surface", theme.surface);
  root.style.setProperty("--theme-surface-muted", theme.surfaceMuted);
  root.style.setProperty("--theme-text", theme.text);
  root.style.setProperty("--theme-muted", theme.mutedText);
  root.style.setProperty("--theme-accent", theme.accent);
  root.style.setProperty("--theme-accent-contrast", accentContrast(theme.accent));
  root.style.setProperty("--theme-accent-soft", hexToRgba(theme.accent, 0.16));
  root.style.setProperty("--theme-accent-focus", hexToRgba(theme.accent, 0.28));
  root.style.setProperty("--theme-border", theme.surfaceMuted);
  // Native controls (date pickers, selects, scrollbars) follow the page instead of staying dark.
  root.style.setProperty("color-scheme", relativeLuminance(theme.background) > 0.4 ? "light" : "dark");
}

// ###############################################
// Motion Helpers
// ###############################################

function MotionPanel({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const presence = useMotionPresence(open);
  if (!presence.mounted) return null;

  return (
    <div className="settings-row-panel" id={id} data-state={presence.state}>
      <div className="settings-row-panel-inner">{children}</div>
    </div>
  );
}

// ###############################################
// Session Hook
// ###############################################

function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, setUser, loading, refresh };
}

// ###############################################
// Shared Components
// ###############################################

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "email" | "tel" | "text" | "numeric";
  required?: boolean;
  autoFocus?: boolean;
  error?: string | null;
  hint?: ReactNode;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const errorId = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = props.type === "password";
  const toggleLabel = t(revealed ? "common.hidePassword" : "common.showPassword");
  const input = (
    <input
      id={inputId}
      type={isPassword && revealed ? "text" : props.type ?? "text"}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      autoComplete={props.autoComplete}
      placeholder={props.placeholder}
      inputMode={props.inputMode}
      required={props.required}
      autoFocus={props.autoFocus}
      spellCheck={isPassword ? false : undefined}
      autoCapitalize={isPassword ? "none" : undefined}
      aria-invalid={props.error ? true : undefined}
      aria-describedby={props.error ? errorId : undefined}
    />
  );

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {props.label}
      </label>
      {isPassword ? (
        <div className="field-control">
          {input}
          <button
            type="button"
            className="field-toggle"
            aria-label={toggleLabel}
            title={toggleLabel}
            // Keep focus (and the mobile keyboard) on the input while toggling.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setRevealed((current) => !current)}
          >
            <EyeIcon crossed={revealed} />
          </button>
        </div>
      ) : (
        input
      )}
      {props.hint}
      {props.error && (
        <p className="field-error" id={errorId} role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T | "";
  onChange: (value: T | "") => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string | null;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as T | "")}>
        {props.placeholder !== null && <option value="">{props.placeholder ?? "Select an option"}</option>}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Alert({ message, tone = "danger" }: { message: string | null; tone?: "danger" | "success" | "info" }) {
  if (!message) return null;
  return <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>{message}</div>;
}

function LogoMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={logoMarkSrc} alt="" draggable="false" />
    </span>
  );
}

function AuthWallpaper({ videoSrc }: { videoSrc: string }) {
  // People who ask for less motion, or who picked the still option, get the gradient without the video.
  const showVideo = videoSrc !== LOGIN_BACKGROUND_NONE && !prefersReducedMotion();

  return (
    <div className="auth-wallpaper" aria-hidden="true">
      {showVideo && (
        <video key={videoSrc} className="auth-wallpaper-video" autoPlay muted loop playsInline>
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
      <div className="auth-wallpaper-gradient" />
      <div className="auth-wallpaper-grid" />
    </div>
  );
}

type ConsoleIconName = "home" | "profile" | "security" | "data" | "apps";

function ConsoleIcon({ icon }: { icon: ConsoleIconName }) {
  if (icon === "data") return <SettingIcon name="database" />;
  if (icon === "apps") return <SettingIcon name="apps" />;
  if (icon === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 11.2 12 5l7.5 6.2" />
        <path d="M6.8 10.6v8h10.4v-8" />
        <path d="M10 18.6v-5h4v5" />
      </svg>
    );
  }
  if (icon === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
        <path d="M5.5 19.2c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
        <path d="M4.8 5.2h3.4M15.8 5.2h3.4M4.8 19h3.4M15.8 19h3.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6.5" y="10" width="11" height="9" rx="2" />
      <path d="M8.5 10V7.8a3.5 3.5 0 0 1 7 0V10" />
      <path d="M12 13.4v2.4" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {Array.from({ length: 9 }).map((_, index) => (
        <circle key={index} cx={6 + (index % 3) * 6} cy={6 + Math.floor(index / 3) * 6} r="1.5" />
      ))}
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4a8 8 0 0 0 0 16h1.1a1.7 1.7 0 0 0 1.2-2.9l-.4-.4a1.7 1.7 0 0 1 1.2-2.9H16a4 4 0 0 0 0-8 9.4 9.4 0 0 0-4-1.8Z" />
      <circle cx="7.8" cy="11" r="1" />
      <circle cx="10.2" cy="7.8" r="1" />
      <circle cx="14.2" cy="8.1" r="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15.3 15.3 4.2 4.2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.4 8.4 8.8 6h6.4l1.4 2.4h2.1a2 2 0 0 1 2 2v6.2a2 2 0 0 1-2 2H5.3a2 2 0 0 1-2-2v-6.2a2 2 0 0 1 2-2h2.1Z" />
      <circle cx="12" cy="13.4" r="3.2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m6.5 17 4.1-4.1 2.6 2.6 2.1-2.1L19 17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-crossed={crossed}>
      <path d="M2.6 12s3.4-6.4 9.4-6.4 9.4 6.4 9.4 6.4-3.4 6.4-9.4 6.4S2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      <path className="eye-icon-slash" d="m4.5 4.5 15 15" />
    </svg>
  );
}

function SettingIcon({ name }: { name: "camera" | "id" | "user" | "mail" | "phone" | "cake" | "globe" | "clock" | "check" | "activity" | "shield" | "key" | "devices" | "lifebuoy" | "alert" | "check-circle" | "apps" | "database" | "download" | "file" | "trash" }) {
  if (name === "camera") {
    return <CameraIcon />;
  }
  if (name === "id") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8.2 15.5c.8-1.4 2.1-2.1 3.8-2.1s3 .7 3.8 2.1" />
        <circle cx="12" cy="10" r="2.3" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="3" />
        <path d="M6.5 19c1-3.2 2.8-4.8 5.5-4.8s4.5 1.6 5.5 4.8" />
      </svg>
    );
  }
  if (name === "mail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="m5 8 7 5 7-5" />
      </svg>
    );
  }
  if (name === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.2 4.6 10 8.4l-2.1 2.1c1.1 2.2 2.9 4 5.6 5.5l2.1-2 3.8 1.8-.8 3.7c-.2.7-.8 1.1-1.5 1-8.2-1.1-12.7-5.6-13.6-13.6-.1-.7.3-1.3 1-1.5l3.7-.8Z" />
      </svg>
    );
  }
  if (name === "cake") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 11h12v8H6z" />
        <path d="M5 15h14M9 11V8M12 11V7M15 11V8M9 5.5h.1M12 4.5h.1M15 5.5h.1" />
      </svg>
    );
  }
  if (name === "globe") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8s-1.1 5.6-3.3 8M12 4c-2.2 2.4-3.3 5.1-3.3 8s1.1 5.6 3.3 8" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6 12 4 4 8-8" />
      </svg>
    );
  }
  if (name === "activity") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 13h4l2-6 4 11 2-5h4" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.8 18.5 6v5.2c0 4.2-2.2 7.2-6.5 9-4.3-1.8-6.5-4.8-6.5-9V6L12 3.8Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === "lifebuoy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="m6.4 6.4 3.3 3.3M14.3 14.3l3.3 3.3M17.6 6.4l-3.3 3.3M9.7 14.3l-3.3 3.3" />
      </svg>
    );
  }
  if (name === "trash") {
    return <TrashIcon />;
  }
  if (name === "alert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4.6 3.9 18.6h16.2L12 4.6Z" />
        <path d="M12 10.2v4M12 16.6v.2" />
      </svg>
    );
  }
  if (name === "check-circle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" />
        <path d="m8.6 12.2 2.3 2.3 4.5-4.8" />
      </svg>
    );
  }
  if (name === "apps") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" />
        <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" />
        <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" />
        <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" />
      </svg>
    );
  }
  if (name === "database") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
        <path d="M5.5 6.5V12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6.5" />
        <path d="M5.5 12v5.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V12" />
      </svg>
    );
  }
  if (name === "download") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4.5v10M8 10.8l4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    );
  }
  if (name === "file") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3.8h7l4 4v12.4H7V3.8Z" />
        <path d="M14 3.8v4h4M9.8 12.5h4.4M9.8 16h4.4" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="8" cy="14" r="3.2" />
        <path d="M11 12.8 20 4M15.8 8H20v4.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="14" height="10" rx="2" />
      <path d="M9 19h6M12 15v4" />
    </svg>
  );
}

type SettingIconName = Parameters<typeof SettingIcon>[0]["name"];

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14" />
      <path d="M9.5 7V5h5v2" />
      <path d="m7 7 .8 12h8.4L17 7" />
      <path d="M10.2 10.5V16M13.8 10.5V16" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M13 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6" />
      <path d="M10.5 12H20" />
      <path d="m16.5 8.5 3.5 3.5-3.5 3.5" />
    </svg>
  );
}

function PasswordRules({ rules }: { rules: Array<{ met: boolean; label: string }> }) {
  return (
    <ul className="rule-list">
      {rules.map((rule) => (
        <li key={rule.label} className={rule.met ? "met" : undefined}>
          <SettingIcon name="check" />
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-page">
      <h1>{title}</h1>
      <div className="settings-column">{children}</div>
    </section>
  );
}

// Passing `expanded` turns the row into a disclosure button for the panel named by `controls`.
function SettingsRow(props: {
  icon: SettingIconName;
  title: string;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  rowRef?: RefObject<HTMLButtonElement>;
}) {
  const content = (
    <>
      <span className="settings-row-icon">
        <SettingIcon name={props.icon} />
      </span>
      <span className="settings-row-copy">
        <strong>{props.title}</strong>
        {props.value !== undefined && <span>{props.value}</span>}
      </span>
      <span className="settings-row-right">
        {props.right}
        {props.onClick && <ChevronIcon />}
      </span>
    </>
  );

  if (props.onClick) {
    return (
      <button
        type="button"
        ref={props.rowRef}
        className="settings-row"
        aria-expanded={props.expanded}
        aria-controls={props.expanded === undefined ? undefined : props.controls}
        onClick={props.onClick}
      >
        {content}
      </button>
    );
  }
  return <div className="settings-row settings-row-static">{content}</div>;
}

function MobileBottomNav({
  route,
  onNavigate
}: {
  route: ConsoleRoute;
  onNavigate: (route: ConsoleRoute) => void;
}) {
  const { t } = useI18n();

  return (
    <nav className="mobile-bottom-nav" aria-label={t("mobile.bottomNav")}>
      {CONSOLE_NAV.map((item) => {
        const active = route === item.route;
        return (
          <button
            key={item.route}
            type="button"
            className={`mobile-bottom-nav-item ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.route)}
          >
            <span className="mobile-bottom-nav-icon">
              <ConsoleIcon icon={item.icon} />
            </span>
            <span>{mobileNavLabel(item.route, t)}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ProfilePictureDialog({
  user,
  setUser,
  onClose
}: {
  user: User;
  setUser: (user: User) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<"change" | "history">("change");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AvatarHistoryItem[]>(user.avatar_history ?? []);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPresence = useMotionPresence(menuOpen, MOTION_FAST_MS);
  const maxSizeLabel = formatFileSize(AVATAR_MAX_BYTES);

  useDismissLayer(menuOpen, () => setMenuOpen(false));
  useOutsideClick(menuRef, menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function chooseFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
      setError(t("avatar.unsupportedType"));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError(t("avatar.tooLarge", { size: maxSizeLabel }));
      return;
    }
    setSelectedFile(file);
  }

  async function savePicture(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) {
      setError(t("avatar.chooseImage"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setUser(await api.uploadAvatar(selectedFile));
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("avatar.uploadFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function removePicture() {
    setMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      setUser(await api.removeAvatar());
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("avatar.removeFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function openHistoryView() {
    setMenuOpen(false);
    setView("history");
    setError(null);
    setSelectedHistoryId(null);
    setConfirmingDelete(false);
    setHistoryLoading(true);
    try {
      setHistory(await api.listAvatarHistory());
    } catch (err) {
      setError(apiErrorMessage(err, t("avatar.historyFailed")));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function restoreSelected() {
    if (!selectedHistoryId) return;
    setBusy(true);
    setError(null);
    try {
      setUser(await api.restoreAvatar(selectedHistoryId));
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("avatar.restoreFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selectedHistoryId) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAvatarHistoryItem(selectedHistoryId);
      setHistory((items) => items.filter((item) => item.public_id !== selectedHistoryId));
      setSelectedHistoryId(null);
      setConfirmingDelete(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("avatar.deleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  function historyDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(locale, { dateStyle: "medium" });
  }

  if (view === "history") {
    return (
      <div className="picture-dialog">
        <div className="dialog-header">
          <button type="button" className="dialog-icon-button" aria-label={t("avatar.back")} onClick={() => { setView("change"); setError(null); }} disabled={busy}>
            <BackIcon />
          </button>
          <h2>{t("avatar.history")}</h2>
        </div>

        {historyLoading ? (
          <div className="dialog-empty">{t("common.loading")}</div>
        ) : history.length === 0 ? (
          <div className="dialog-empty">{t("avatar.historyEmpty")}</div>
        ) : (
          <>
            <p className="dialog-hint">{t("avatar.historyHint")}</p>
            <div className="history-grid" role="radiogroup" aria-label={t("avatar.history")}>
              {history.map((item) => {
                const selected = item.public_id === selectedHistoryId;
                return (
                  <button
                    key={item.public_id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`history-item${selected ? " selected" : ""}`}
                    onClick={() => { setSelectedHistoryId(item.public_id); setConfirmingDelete(false); }}
                    disabled={busy}
                  >
                    <img src={item.url} alt="" />
                    <span>{historyDate(item.replaced_at)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <Alert message={error} />
        {confirmingDelete ? (
          <div className="confirm-row">
            <span>{t("avatar.deleteConfirm")}</span>
            <div className="button-row">
              <button type="button" className="secondary danger" onClick={deleteSelected} disabled={busy}>
                {busy ? t("avatar.deleting") : t("avatar.deleteSelected")}
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : history.length > 0 && (
          <div className="button-row">
            <button type="button" className="primary" onClick={restoreSelected} disabled={busy || !selectedHistoryId} aria-busy={busy}>
              {t("avatar.restoreSelected")}
            </button>
            <button type="button" className="secondary danger" onClick={() => setConfirmingDelete(true)} disabled={busy || !selectedHistoryId}>
              {t("avatar.deleteSelected")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="picture-dialog" onSubmit={savePicture}>
      <div className="dialog-header">
        <button type="button" className="dialog-icon-button" aria-label={t("avatar.close")} onClick={onClose}>
          <CloseIcon />
        </button>
        <h2>{t("avatar.change")}</h2>
        <div className="dialog-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`dialog-icon-button${menuOpen ? " active" : ""}`}
            aria-label={t("avatar.more")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            disabled={busy}
          >
            <MoreIcon />
          </button>
          {menuPresence.mounted && (
            <div className="dialog-menu" role="menu" data-state={menuPresence.state}>
              <button type="button" role="menuitem" onClick={openHistoryView}>
                <SettingIcon name="clock" />
                {t("avatar.history")}
              </button>
              {user.avatar_url && (
                <button type="button" role="menuitem" className="danger" onClick={removePicture}>
                  <TrashIcon />
                  {t("avatar.remove")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="avatar-stage">
        {selectedFile && previewUrl ? (
          <div className="avatar-compare">
            <figure>
              <Avatar user={user} />
              <figcaption>{t("avatar.current")}</figcaption>
            </figure>
            <span className="avatar-compare-arrow" aria-hidden="true">
              <ChevronIcon />
            </span>
            <figure className="avatar-compare-new">
              <img className="avatar" src={previewUrl} alt={t("avatar.previewAlt")} />
              <figcaption>{selectedFile.name} · {formatFileSize(selectedFile.size)}</figcaption>
            </figure>
          </div>
        ) : (
          <Avatar user={user} />
        )}
      </div>

      <div className="dialog-action-list">
        <label className="dialog-action-row">
          <span className="dialog-action-icon">
            <ImageIcon />
          </span>
          <span className="dialog-action-copy">
            <strong>{selectedFile ? t("avatar.chooseAnother") : t("avatar.uploadFromDevice")}</strong>
            <small>{t("avatar.fileHint", { size: maxSizeLabel })}</small>
          </span>
          <input
            type="file"
            accept={AVATAR_ACCEPTED_TYPES.join(",")}
            onChange={(event) => {
              chooseFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
            disabled={busy}
          />
        </label>
        {user.avatar_url && !selectedFile && (
          <button type="button" className="dialog-action-row danger" onClick={removePicture} disabled={busy}>
            <span className="dialog-action-icon">
              <TrashIcon />
            </span>
            <span className="dialog-action-copy">
              <strong>{t("avatar.removeCurrent")}</strong>
              <small>{t("avatar.removeHint")}</small>
            </span>
          </button>
        )}
      </div>

      <Alert message={error} />
      <div className="button-row">
        <button className="primary" disabled={busy || !selectedFile} aria-busy={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// ###############################################
// Console Chrome
// ###############################################

type SearchEntry = {
  id: string;
  label: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
};

function useSearchEntries(): SearchEntry[] {
  const { t } = useI18n();
  const chrome = useChrome();

  // Keywords carry both languages so a search works whichever one the interface is in.
  return useMemo(() => [
    { id: "name", label: t("common.name"), keywords: "name display 姓名 名字 名称", icon: <SettingIcon name="id" />, run: () => goProfileEdit("name") },
    { id: "picture", label: t("common.profilePicture"), keywords: "avatar picture photo 头像 照片", icon: <SettingIcon name="camera" />, run: chrome.openPictureModal },
    { id: "gender", label: t("common.gender"), keywords: "gender 性别", icon: <SettingIcon name="user" />, run: () => goProfileEdit("gender") },
    { id: "phone", label: t("common.phone"), keywords: "phone mobile number 电话 手机 号码", icon: <SettingIcon name="phone" />, run: () => goProfileEdit("phone") },
    { id: "birthday", label: t("common.birthday"), keywords: "birthday birth date 生日 出生", icon: <SettingIcon name="cake" />, run: () => goProfileEdit("birthday") },
    { id: "language", label: t("common.language"), keywords: "language locale english chinese 语言 中文 英文", icon: <SettingIcon name="globe" />, run: () => goProfileEdit("language") },
    { id: "timezone", label: t("common.timezone"), keywords: "timezone time zone 时区 时间", icon: <SettingIcon name="clock" />, run: () => goProfileEdit("timezone") },
    { id: "password", label: t("security.changePassword"), keywords: "password 密码", icon: <SettingIcon name="key" />, run: () => goSecuritySection("password") },
    { id: "verification", label: t("common.extraVerification"), keywords: "verification mfa 2fa otp authenticator two-step 验证 两步 双重", icon: <SettingIcon name="shield" />, run: () => goSecuritySection("verification") },
    { id: "sessions", label: t("common.activeSessions"), keywords: "sessions devices sign out 会话 设备 退出", icon: <SettingIcon name="devices" />, run: () => goSecuritySection("sessions") },
    { id: "activity", label: t("account.activityTitle"), keywords: "activity events log history 活动 记录 日志", icon: <SettingIcon name="activity" />, run: () => goSecuritySection("activity") },
    { id: "backup-codes", label: t("backup.title"), keywords: "backup codes recovery lost authenticator 备用 验证码 恢复 丢失", icon: <SettingIcon name="lifebuoy" />, run: () => goSecuritySection("backup-codes") },
    { id: "recovery-email", label: t("recoveryEmail.title"), keywords: "recovery email backup address 恢复 邮箱 备用", icon: <SettingIcon name="mail" />, run: () => goSecuritySection("recovery-email") },
    { id: "email", label: t("email.searchLabel"), keywords: "email verify verification address 邮箱 验证", icon: <SettingIcon name="mail" />, run: () => goProfileEdit("email") },
    { id: "checkup", label: t("checkup.title"), keywords: "security checkup check review safe 安全 检查 体检", icon: <SettingIcon name="shield" />, run: () => go("security") },
    { id: "connected-apps", label: t("apps.title"), keywords: "connected apps third-party access permissions remove revoke 应用 第三方 授权 权限 移除", icon: <SettingIcon name="apps" />, run: () => go("connected-apps") },
    { id: "data-privacy", label: t("data.title"), keywords: "data privacy stored information 数据 隐私 信息", icon: <SettingIcon name="database" />, run: () => go("data-privacy") },
    { id: "download-data", label: t("data.downloadTitle"), keywords: "download export data copy takeout json 下载 导出 数据 备份", icon: <SettingIcon name="download" />, run: () => go("data-privacy") },
    { id: "delete-account", label: t("data.deleteTitle"), keywords: "delete account close remove erase 删除 注销 账号 账户", icon: <SettingIcon name="trash" />, run: () => go("data-privacy") },
    { id: "appearance", label: t("theme.appearance"), keywords: "appearance theme color dark light background 外观 主题 颜色 深色 浅色 背景", icon: <ThemeIcon />, run: chrome.openAppearance }
  ], [t, chrome]);
}

function TopbarSearch() {
  const { t } = useI18n();
  const entries = useSearchEntries();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(
    () => normalizedQuery ? entries.filter((entry) => `${entry.label} ${entry.keywords}`.toLowerCase().includes(normalizedQuery)) : [],
    [entries, normalizedQuery]
  );
  const showResults = open && normalizedQuery !== "";

  useDismissLayer(showResults, () => setOpen(false));
  useOutsideClick(formRef, showResults, () => setOpen(false));

  function choose(entry: SearchEntry) {
    setQuery("");
    setOpen(false);
    entry.run();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const entry = results[activeIndex] ?? results[0];
    if (entry) choose(entry);
  }

  function moveActive(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!showResults || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    }
  }

  return (
    <form className="topbar-search" role="search" ref={formRef} onSubmit={submit}>
      <SearchIcon />
      <input
        role="combobox"
        aria-expanded={showResults}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showResults && results.length > 0 ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={moveActive}
        placeholder={t("account.searchSettings")}
        aria-label={t("account.searchSettings")}
      />
      {showResults && (
        <div className="search-results" id={listId} role="listbox">
          {results.length === 0 ? (
            <div className="search-empty">{t("account.searchEmpty", { query: query.trim() })}</div>
          ) : results.map((entry, index) => (
            <button
              key={entry.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`search-result${index === activeIndex ? " active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(entry)}
            >
              <span className="search-result-icon">{entry.icon}</span>
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function AppsLauncher({ user }: { user: User }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<LauncherApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const presence = useMotionPresence(open, MOTION_FAST_MS);

  useDismissLayer(open, () => setOpen(false));
  useOutsideClick(launcherRef, open, () => setOpen(false));

  async function loadApps() {
    setLoading(true);
    setError(null);
    try {
      setApps(await api.listLauncherApps());
    } catch (err) {
      setError(apiErrorMessage(err, t("account.appsLoadFailed")));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    // A failed load leaves `apps` empty, so opening the launcher again retries it.
    if (nextOpen && apps === null && !loading) void loadApps();
  }

  function openApp(app: LauncherApp) {
    setOpen(false);
    window.location.href = app.launch_url || app.home_url;
  }

  return (
    <div className="apps-menu" ref={launcherRef}>
      <button className="icon-button" aria-label={t("account.openApps")} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <GridIcon />
      </button>
      {presence.mounted && (
        <div className="apps-popover" role="dialog" aria-label={t("account.appsLauncher")} data-state={presence.state}>
          <div className="apps-launcher-panel">
            <div className="apps-launcher-header">
              <h2>{t("account.yourApps")}</h2>
            </div>
            <div className="apps-launcher-body">
              <div className="apps-grid">
                <button className="launcher-app-tile" onClick={() => { setOpen(false); go("account"); }}>
                  <span className="launcher-app-icon launcher-account-icon">
                    <Avatar user={user} />
                  </span>
                  <span className="launcher-app-name">{t("common.account")}</span>
                </button>
                {(apps ?? []).map((app) => (
                  <button key={app.client_id} className="launcher-app-tile" onClick={() => openApp(app)} title={app.name}>
                    <LauncherAppIcon app={app} />
                    <span className="launcher-app-name">{app.name}</span>
                  </button>
                ))}
              </div>
              {loading && <div className="launcher-inline-state">{t("account.appsLoading")}</div>}
              {error && (
                <div className="launcher-inline-state launcher-inline-error" role="alert">
                  <span>{error}</span>
                  <button type="button" className="secondary" onClick={() => void loadApps()}>
                    {t("common.retry")}
                  </button>
                </div>
              )}
              {!loading && !error && apps !== null && apps.length === 0 && (
                <div className="launcher-inline-state">{t("account.noConnectedApps")}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ user }: { user: User }) {
  const { t, language, setLanguage } = useI18n();
  const chrome = useChrome();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const presence = useMotionPresence(open, MOTION_FAST_MS);
  const legalCopy = LEGAL_COPY[language];

  useDismissLayer(open, () => setOpen(false));
  useOutsideClick(menuRef, open, () => setOpen(false));

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  async function changeLanguage(nextLanguage: SupportedLanguage) {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    try {
      chrome.setUser(await api.updateProfile({ locale: localeForLanguage(nextLanguage) }));
    } catch {
      // The switch still applies in this browser; the saved profile language is left as it was.
    }
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="avatar-button"
        aria-label={t("account.openAccountMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar user={user} />
      </button>
      {presence.mounted && (
        <div className="account-popover account-menu-popover" role="dialog" aria-label={t("account.menuLabel")} data-state={presence.state}>
          <div className="menu-identity">
            <Avatar user={user} />
            <div>
              <strong>{user.display_name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="menu-list">
            <button type="button" className="menu-item" onClick={() => run(() => go("profile"))}>
              <SettingIcon name="id" />
              <span>{t("account.manage", { product: PRODUCT_NAME })}</span>
              <ChevronIcon />
            </button>
            <button type="button" className="menu-item" onClick={() => run(chrome.openPictureModal)}>
              <CameraIcon />
              <span>{t("avatar.change")}</span>
            </button>
            <div className="menu-item menu-item-static">
              <SettingIcon name="globe" />
              <span>{t("common.language")}</span>
              <LanguageSwitcher onSelect={(nextLanguage) => void changeLanguage(nextLanguage)} />
            </div>
            <button type="button" className="menu-item" onClick={() => run(chrome.openAppearance)}>
              <ThemeIcon />
              <span>{t("theme.appearance")}</span>
              <ChevronIcon />
            </button>
            <button type="button" className="menu-item" onClick={() => run(chrome.logout)}>
              <SignOutIcon />
              <span>{t("common.signOut")}</span>
            </button>
          </div>
          <nav className="menu-footer-links" aria-label={legalCopy.navLabel}>
            {LEGAL_ROUTES.map((route) => (
              <button type="button" key={route} onClick={() => run(() => go(route))}>
                {legalCopy.documents[route].tab}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

// "Later" only hides the prompt for this browser session; nothing is skipped on the account itself.
function isOnboardingSnoozed(userId: string) {
  try {
    return window.sessionStorage.getItem(ONBOARDING_SNOOZE_STORAGE_KEY) === userId;
  } catch {
    return false;
  }
}

function snoozeOnboarding(userId: string) {
  try {
    window.sessionStorage.setItem(ONBOARDING_SNOOZE_STORAGE_KEY, userId);
  } catch {
    // Without session storage the prompt simply returns on the next visit to the home page.
  }
}

function OnboardingPrompt({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const { t } = useI18n();
  const pending = Boolean(user.profile_completion.next_prompt_field && !user.profile_completion.onboarding_completed);
  const [open, setOpen] = useState(() => pending && !isOnboardingSnoozed(user.id));
  // Keeps the last step on screen while the dialog fades out after the final answer.
  const lastPendingUser = useRef(user);
  if (pending) lastPendingUser.current = user;

  const remindLater = () => {
    snoozeOnboarding(user.id);
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={remindLater} label={t("onboarding.dialogLabel")} className="onboarding-dialog">
      <button type="button" className="dialog-icon-button onboarding-dialog-close" aria-label={t("onboarding.later")} onClick={remindLater}>
        <CloseIcon />
      </button>
      <ProfileOnboardingPanel user={pending ? user : lastPendingUser.current} setUser={setUser} onFinished={() => setOpen(false)} />
      <p className="dialog-hint">{t("onboarding.laterHint")}</p>
    </Modal>
  );
}

function Shell({
  user,
  setUser,
  route,
  children
}: {
  user: User;
  setUser: (user: User) => void;
  route: ConsoleRoute;
  children: ReactNode;
}) {
  const { t, language } = useI18n();
  const legalCopy = LEGAL_COPY[language];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go("account")}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>
        <nav className="sidebar-nav" aria-label={t("account.settings")}>
          {CONSOLE_NAV.map((item) => {
            const active = route === item.route;
            return (
              <button
                key={item.route}
                className={`nav-item ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                // On a tablet the label of an inactive item is hidden, so the name is also given here.
                aria-label={consoleNavLabel(item.route, t)}
                title={consoleNavLabel(item.route, t)}
                onClick={() => go(item.route)}
              >
                <span className={`nav-icon nav-icon-${item.tone}`}>
                  <ConsoleIcon icon={item.icon} />
                </span>
                <span>{consoleNavLabel(item.route, t)}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <nav className="sidebar-footer-links" aria-label={legalCopy.navLabel}>
            {LEGAL_ROUTES.map((legalRoute) => (
              <button type="button" key={legalRoute} onClick={() => go(legalRoute)}>
                {legalCopy.documents[legalRoute].tab}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="console-shell">
        <header className="console-topbar">
          <button className="mobile-topbar-brand brand" onClick={() => go("account")}>
            <LogoMark />
            <span>{PRODUCT_NAME}</span>
          </button>
          <TopbarSearch />
          <AppsLauncher user={user} />
          <AccountMenu user={user} />
        </header>
        <main className="main">
          <div key={route} className="motion-page" data-state="open">
            {children}
          </div>
        </main>
      </div>
      {route === "account" && <OnboardingPrompt user={user} setUser={setUser} />}
      <MobileBottomNav route={route} onNavigate={go} />
    </div>
  );
}

function ProfileEditDetailShell({
  user,
  title,
  children
}: {
  user: User;
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <main className="profile-edit-shell">
      <header className="profile-edit-topbar">
        <button className="brand profile-edit-brand" onClick={() => go("account")}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>
        <AccountMenu user={user} />
      </header>

      <section key={title} className="profile-edit-stage motion-page" data-state="open">
        <div className="profile-edit-header">
          <button className="profile-edit-back" aria-label={t("profile.backToPersonalInfo")} onClick={() => go("profile")}>
            <BackIcon />
          </button>
          <h1>{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

function AuthBrand() {
  return (
    <button className="auth-brand" onClick={() => go("login")}>
      <LogoMark />
      <span>{PRODUCT_NAME}</span>
    </button>
  );
}

// `onSelect` lets a caller persist the choice; without it the switch only changes this browser.
function LanguageSwitcher({ className = "", onSelect }: { className?: string; onSelect?: (language: SupportedLanguage) => void }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className={`language-switcher ${className}`} role="group" aria-label={t("common.language")}>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.value}
          className={language === option.value ? "active" : ""}
          aria-pressed={language === option.value}
          onClick={() => (onSelect ?? setLanguage)(option.value)}
        >
          {option.shortLabel}
        </button>
      ))}
    </div>
  );
}

function Avatar({ user }: { user: User | null }) {
  if (user?.avatar_url) {
    return <img className="avatar" src={user.avatar_url} alt={`${user.display_name} avatar`} />;
  }
  return <div className="avatar avatar-fallback">{userInitials(user)}</div>;
}

function LauncherAppIcon({ app }: { app: Pick<LauncherApp, "name" | "icon_url"> }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (app.icon_url && !imageFailed) {
    return (
      <span className="launcher-app-icon launcher-app-image">
        <img src={app.icon_url} alt="" draggable="false" onError={() => setImageFailed(true)} />
      </span>
    );
  }

  return (
    <span className="launcher-app-icon launcher-app-fallback" aria-hidden="true">
      {appInitials(app.name)}
    </span>
  );
}

// ###############################################
// Legal Pages
// ###############################################

function LegalIllustration() {
  return (
    <div className="legal-illustration" aria-hidden="true">
      <svg viewBox="0 0 360 180" focusable="false">
        <path className="legal-illustration-line" d="M46 122c23-42 60-55 111-39 45 14 77 4 102-30" />
        <path className="legal-illustration-shield" d="M180 34 231 52v41c0 35-17 59-51 74-34-15-51-39-51-74V52l51-18Z" />
        <path className="legal-illustration-g" d="M197 85h-27v22h49c-5 18-20 30-40 30-28 0-51-22-51-50s23-50 51-50c13 0 25 5 34 13l-18 18c-4-4-10-7-16-7-14 0-26 12-26 26s12 26 26 26c9 0 17-4 22-11h-22V85h18Z" />
        <rect className="legal-illustration-card" x="49" y="99" width="78" height="49" rx="8" />
        <path className="legal-illustration-line" d="M67 124h42M67 137h28" />
        <circle className="legal-illustration-dot" cx="282" cy="75" r="18" />
        <path className="legal-illustration-line" d="M282 93v40M263 133h38" />
        <rect className="legal-illustration-toggle" x="247" y="105" width="64" height="34" rx="17" />
        <circle className="legal-illustration-toggle-dot" cx="264" cy="122" r="12" />
      </svg>
    </div>
  );
}

function LegalDocumentPage({ route }: { route: LegalRoute }) {
  const { language, locale } = useI18n();
  const copy = LEGAL_COPY[language];
  const legalDocument = copy.documents[route];
  const introId = `legal-${route}-intro`;
  // The contents list is derived from the headings on the page, so every link has a target.
  const contents = [
    { id: introId, title: copy.introduction },
    ...legalDocument.sections.map((section, index) => ({ id: `legal-${route}-section-${index}`, title: section.title }))
  ];
  const [activeId, setActiveId] = useState(introId);

  useEffect(() => {
    setActiveId(introId);
    const headings = contents
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];
        if (topmost) setActiveId(topmost.target.id);
      },
      { rootMargin: "-96px 0px -60% 0px" }
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [route, language]);

  function jumpTo(id: string) {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  return (
    <section className="doc-page">
      <nav className="doc-tabs" aria-label={copy.navLabel}>
        {LEGAL_ROUTES.map((item) => (
          <button
            key={item}
            type="button"
            className={`doc-tab${item === route ? " active" : ""}`}
            aria-current={item === route ? "page" : undefined}
            onClick={() => go(item)}
          >
            {copy.documents[item].tab}
          </button>
        ))}
      </nav>

      <div className="doc-grid">
        <nav className="doc-contents" aria-label={copy.onThisPage}>
          <span className="doc-contents-title">{copy.onThisPage}</span>
          {contents.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={item.id === activeId ? "active" : undefined}
              aria-current={item.id === activeId ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                jumpTo(item.id);
              }}
            >
              {item.title}
            </a>
          ))}
        </nav>

        <article key={route} className="doc-article motion-page">
          <LegalIllustration />
          <p className="doc-kicker">{legalDocument.label}</p>
          <h1 id={introId}>{legalDocument.headline}</h1>
          <p className="doc-lead">{legalDocument.body}</p>
          {legalDocument.dated && (
            <p className="doc-updated">{copy.lastUpdated.replace("{date}", formatCalendarDate(LEGAL_LAST_UPDATED, locale))}</p>
          )}
          {legalDocument.sections.map((section, index) => (
            <section key={section.title} id={`legal-${route}-section-${index}`}>
              <h2>{section.title}</h2>
              {section.blocks.map((block, blockIndex) =>
                typeof block === "string" ? (
                  <p key={blockIndex}>{fillLegalContact(block, copy)}</p>
                ) : (
                  <ul key={blockIndex}>
                    {block.map((item) => (
                      <li key={item}>{fillLegalContact(item, copy)}</li>
                    ))}
                  </ul>
                )
              )}
              {section.links && (
                <div className="doc-links">
                  {section.links.map((link) => (
                    <a
                      key={link.path}
                      href={link.path}
                      onClick={(event) => {
                        event.preventDefault();
                        goPath(link.path);
                      }}
                    >
                      {link.label}
                      <ChevronIcon />
                    </a>
                  ))}
                </div>
              )}
            </section>
          ))}
        </article>
      </div>
    </section>
  );
}

// Legal pages are public: signed-out visitors get language, appearance, and sign-in controls instead of the account menu.
function LegalShell({ user, route }: { user: User | null; route: LegalRoute }) {
  const { t } = useI18n();

  return (
    <main className="doc-shell">
      <header className="doc-topbar">
        <button className="brand" onClick={() => go(user ? "account" : "login")}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>
        <div className="doc-topbar-actions">
          {user ? (
            <>
              <AppsLauncher user={user} />
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <AppearanceButton />
              <button type="button" className="secondary" onClick={() => go("login")}>
                {t("common.signIn")}
              </button>
            </>
          )}
        </div>
      </header>

      <LegalDocumentPage route={route} />
    </main>
  );
}

function AuthLayout({ children, backgroundSrc }: { children: ReactNode; backgroundSrc: string }) {
  const { t } = useI18n();
  const panel = useAnimatedHeight<HTMLDivElement, HTMLDivElement>();
  return (
    <main className="auth-page">
      <AuthWallpaper videoSrc={backgroundSrc} />
      <header className="auth-header">
        <AuthBrand />
        <LanguageSwitcher className="auth-language-switcher" />
        <AppearanceButton />
      </header>
      <section className="auth-layout">
        <div className="auth-copy">
          <h1>{t("auth.heroTitle")}</h1>
          <p>{t("auth.heroBody")}</p>
          <div className="auth-summary">
            <div className="auth-summary-item">
              <strong>{t("auth.summaryAccountTitle")}</strong>
              <span>{t("auth.summaryAccountBody")}</span>
            </div>
            <div className="auth-summary-item">
              <strong>{t("auth.summarySecurityTitle")}</strong>
              <span>{t("auth.summarySecurityBody")}</span>
            </div>
            <div className="auth-summary-item">
              <strong>{t("auth.summaryAccessTitle")}</strong>
              <span>{t("auth.summaryAccessBody")}</span>
            </div>
          </div>
        </div>
        <div className="panel auth-panel" ref={panel.outerRef}>
          <div className="auth-panel-inner" ref={panel.innerRef}>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

function StandaloneAccessState({ loading, backgroundSrc }: { loading: boolean; backgroundSrc: string }) {
  const { t } = useI18n();
  return (
    <main className="auth-page auth-state-page">
      <AuthWallpaper videoSrc={backgroundSrc} />
      <header className="auth-header">
        <AuthBrand />
        <LanguageSwitcher className="auth-language-switcher" />
        <AppearanceButton />
      </header>
      <section className="auth-state">
        <div className="panel empty-state">
          <h2>{loading ? t("auth.loadingAccount") : t("auth.signInRequired")}</h2>
          <p>
            {loading
              ? t("auth.checkingSession")
              : t("auth.signInRequiredBody", { product: PRODUCT_NAME })}
          </p>
          {!loading && (
            <button className="primary" onClick={() => go("login")}>
              {t("common.signIn")}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function playBackgroundPreview(option: HTMLElement) {
  if (prefersReducedMotion()) return;
  void option.querySelector("video")?.play().catch(() => {
    // A blocked preview stays on its still frame.
  });
}

function pauseBackgroundPreview(option: HTMLElement) {
  option.querySelector("video")?.pause();
}

function BackgroundPicker({
  selectedSrc,
  onSelect,
  onClose
}: {
  selectedSrc: string;
  onSelect: (src: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="background-dialog">
      <div className="dialog-header">
        <h2>{t("theme.bgPickerTitle")}</h2>
        <button type="button" className="dialog-icon-button" aria-label={t("theme.bgPickerClose")} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <p className="dialog-hint">{t("theme.bgHint")}</p>

      <div className="background-grid" role="radiogroup" aria-label={t("theme.bgPickerTitle")}>
        {LOGIN_BACKGROUND_OPTIONS.map((option, index) => {
          const selected = option.src === selectedSrc;
          return (
            <button
              type="button"
              key={option.id}
              role="radio"
              aria-checked={selected}
              aria-label={t("theme.bgOption", { number: index + 1 })}
              className={`background-option${selected ? " selected" : ""}`}
              onClick={() => onSelect(option.src)}
              onMouseEnter={(event) => playBackgroundPreview(event.currentTarget)}
              onMouseLeave={(event) => pauseBackgroundPreview(event.currentTarget)}
              onFocus={(event) => playBackgroundPreview(event.currentTarget)}
              onBlur={(event) => pauseBackgroundPreview(event.currentTarget)}
            >
              {/* Only metadata is fetched; the fragment shows a still frame until the option is hovered. */}
              <video src={`${option.src}#t=0.1`} muted loop playsInline preload="metadata" tabIndex={-1} />
              {selected && (
                <span className="background-option-check" aria-hidden="true">
                  <SettingIcon name="check" />
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={selectedSrc === LOGIN_BACKGROUND_NONE}
          className={`background-option background-option-none${selectedSrc === LOGIN_BACKGROUND_NONE ? " selected" : ""}`}
          onClick={() => onSelect(LOGIN_BACKGROUND_NONE)}
        >
          <span>{t("theme.bgNone")}</span>
          {selectedSrc === LOGIN_BACKGROUND_NONE && (
            <span className="background-option-check" aria-hidden="true">
              <SettingIcon name="check" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function AppearanceDialog({
  theme,
  onThemeChange,
  loginBackgroundSrc,
  onLoginBackgroundChange,
  onClose
}: {
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  loginBackgroundSrc: string;
  onLoginBackgroundChange: (src: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [customOpen, setCustomOpen] = useState(false);
  const [contrastWarning, setContrastWarning] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const activePreset = THEME_PRESETS.find((preset) => sameTheme(preset.theme, theme));

  const applyTheme = (nextTheme: ThemeSettings) => {
    setContrastWarning(false);
    onThemeChange(nextTheme);
  };

  const updateColor = (field: ThemeField, color: string) => {
    if (!isHexColor(color)) return;
    const nextTheme = { ...theme, [field]: color };
    // A combination that hides text is refused, so the page can never become unreadable.
    if (!isReadableTheme(nextTheme)) {
      setContrastWarning(true);
      return;
    }
    applyTheme(nextTheme);
  };

  return (
    <div className="appearance-dialog">
      <div className="dialog-header">
        <h2>{t("theme.appearance")}</h2>
        <button type="button" className="dialog-icon-button" aria-label={t("theme.close")} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <p className="dialog-hint">{t("theme.savedLocal")}</p>

      <div className="preset-grid" role="radiogroup" aria-label={t("theme.presets")}>
        {THEME_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            role="radio"
            aria-checked={activePreset?.id === preset.id}
            className={`preset-swatch${activePreset?.id === preset.id ? " selected" : ""}`}
            style={{ background: preset.theme.background, color: preset.theme.text, borderColor: preset.theme.surfaceMuted }}
            onClick={() => applyTheme(preset.theme)}
          >
            <span className="preset-swatch-accent" style={{ background: preset.theme.accent }} aria-hidden="true" />
            <span>{t(preset.labelKey)}</span>
          </button>
        ))}
      </div>

      <button type="button" className="dialog-toggle-row" aria-expanded={customOpen} onClick={() => setCustomOpen((open) => !open)}>
        <span>{t("theme.customColors")}</span>
        <ChevronIcon />
      </button>
      {customOpen && (
        <div className="theme-color-list">
          {THEME_FIELDS.map((field) => (
            <label className="theme-color-row" key={field.key}>
              <span>
                <strong>{t(field.labelKey)}</strong>
                <small>{t(field.descriptionKey)}</small>
              </span>
              <input
                type="color"
                value={theme[field.key]}
                aria-label={t(field.labelKey)}
                onChange={(event) => updateColor(field.key, event.target.value)}
              />
              <code>{theme[field.key]}</code>
            </label>
          ))}
        </div>
      )}
      {contrastWarning && <Alert message={t("theme.contrastWarning")} tone="info" />}

      <div className="button-row">
        <button type="button" className="secondary" onClick={() => setBackgroundPickerOpen(true)}>
          {t("theme.background")}
        </button>
        <button type="button" className="secondary" onClick={() => applyTheme(DEFAULT_THEME)}>
          {t("theme.reset")}
        </button>
      </div>

      <Modal open={backgroundPickerOpen} onClose={() => setBackgroundPickerOpen(false)} label={t("theme.bgPickerTitle")} className="background-modal">
        <BackgroundPicker selectedSrc={loginBackgroundSrc} onSelect={onLoginBackgroundChange} onClose={() => setBackgroundPickerOpen(false)} />
      </Modal>
    </div>
  );
}

// Signed-out pages have no account menu, so they reach the appearance settings from this header button.
function AppearanceButton() {
  const { t } = useI18n();
  const chrome = useChrome();

  return (
    <button type="button" className="appearance-button" aria-label={t("theme.appearance")} title={t("theme.appearance")} onClick={chrome.openAppearance}>
      <ThemeIcon />
    </button>
  );
}

// ###############################################
// Authentication Screens
// ###############################################

function RegisterPage({ onAuthenticated }: { onAuthenticated: AuthenticatedHandler }) {
  const { t, language } = useI18n();
  const legalDocuments = LEGAL_COPY[language].documents;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const longEnough = password.length >= PASSWORD_MIN_LENGTH;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!longEnough) {
      setError(t("password.tooShort", { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("reset.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.register({ email, display_name: displayName, password });
      setSetup(response.mfa_setup);
    } catch (err) {
      setError(apiErrorMessage(err, t("register.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div key={setup ? "mfa-setup" : "details"} className="motion-page">
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>{t("register.title")}</h2>
            <p>{t("register.body")}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} autoComplete="name" required />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" required />
            <PasswordRules rules={[{ met: longEnough, label: t("password.ruleLength", { count: PASSWORD_MIN_LENGTH }) }]} />
            <Field label={t("reset.confirmPassword")} type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" required />
            <label className="check-field terms-field">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>
                {t("register.agreePrefix")}
                <a href="/terms" target="_blank" rel="noreferrer">{legalDocuments.terms.label}</a>
                {t("register.agreeAnd")}
                <a href="/privacy" target="_blank" rel="noreferrer">{legalDocuments.privacy.label}</a>
                {t("register.agreeSuffix")}
              </span>
            </label>
            <Alert message={error} />
            <button className="primary" disabled={busy} aria-busy={busy}>
              {busy ? t("register.busy") : t("register.submit")}
            </button>
          </form>
          <button className="link-button" onClick={() => go("login")}>
            {t("register.haveAccount")}
          </button>
        </>
      )}
    </div>
  );
}

function LoginPage({ onAuthenticated }: { onAuthenticated: AuthenticatedHandler }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(loadRememberedEmail);
  const accountDeleted = new URLSearchParams(window.location.search).get("deleted") === "1";
  const [rememberEmail, setRememberEmail] = useState(() => loadRememberedEmail() !== "");
  const [password, setPassword] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaOptions, setMfaOptions] = useState<MfaOptions>(DEFAULT_MFA_OPTIONS);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleLoginResponse(response: LoginResponse) {
    if (response.user) {
      onAuthenticated(response.user);
      return;
    }
    if (response.mfa_required && response.challenge_id) {
      setMfaChallenge(response.challenge_id);
      setMfaOptions(mfaOptionsFromResponse(response));
      return;
    }
    if (response.mfa_setup_required && response.mfa_setup) {
      setSetup(response.mfa_setup);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.login({ email, password });
      // Only an email the server accepted is remembered.
      saveRememberedEmail(rememberEmail ? email.trim() : null);
      handleLoginResponse(response);
    } catch (err) {
      setError(apiErrorMessage(err, t("login.failed")));
    } finally {
      setBusy(false);
    }
  }

  function toggleRememberEmail(checked: boolean) {
    setRememberEmail(checked);
    // Forget right away instead of waiting for the next sign-in.
    if (!checked) saveRememberedEmail(null);
  }

  return (
    <div key={setup ? "mfa-setup" : mfaChallenge ? "mfa-verify" : "credentials"} className="motion-page">
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} options={mfaOptions} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>{t("login.title")}</h2>
            <p>{t("login.body")}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Alert message={accountDeleted ? t("login.accountDeleted") : null} tone="info" />
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
            <label className="check-field">
              <input type="checkbox" checked={rememberEmail} onChange={(event) => toggleRememberEmail(event.target.checked)} />
              <span>{t("login.rememberEmail")}</span>
            </label>
            <Alert message={error} />
            <button className="primary" disabled={busy} aria-busy={busy}>
              {busy ? t("login.busy") : t("login.submit")}
            </button>
          </form>
          <div className="link-stack">
            <button className="link-button" onClick={() => go("forgot-password")}>
              {t("login.forgot")}
            </button>
            <button className="link-button" onClick={() => go("register")}>
              {t("login.needAccount")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OAuthAuthorizeLayout({
  context,
  showScopes,
  children,
  backgroundSrc
}: {
  context: AuthorizeContext | null;
  showScopes: boolean;
  children: ReactNode;
  backgroundSrc: string;
}) {
  const { t } = useI18n();
  return (
    <main className="oauth-page">
      <AuthWallpaper videoSrc={backgroundSrc} />
      <section className="oauth-card">
        <header className="oauth-header">
          <div className="oauth-header-row">
            <div className="oauth-brand">
              <LogoMark />
              <span>{PRODUCT_NAME}</span>
            </div>
            <div className="oauth-header-actions">
              <LanguageSwitcher />
              <AppearanceButton />
            </div>
          </div>
          <div className="oauth-context">
            <span>{t("oauth.continueTo")}</span>
            <strong>{context?.client_name ?? t("oauth.connectedApp")}</strong>
          </div>
        </header>
        {context && showScopes && (
          <div className="oauth-scopes" aria-label={t("oauth.requestedAccess")}>
            {context.scopes.map((scope) => (
              <span key={scope}>{oauthScopeLabel(scope, t)}</span>
            ))}
          </div>
        )}
        {children}
      </section>
    </main>
  );
}

function OAuthAuthorizePage({
  user,
  loading,
  onAuthenticated,
  onSwitchAccount,
  backgroundSrc
}: {
  user: User | null;
  loading: boolean;
  onAuthenticated: AuthenticatedHandler;
  onSwitchAccount: () => Promise<void>;
  backgroundSrc: string;
}) {
  const { t } = useI18n();
  const next = nextUrl();
  const authorizeRequest = useMemo(() => parseAuthorizeRequest(next), [next]);
  const [context, setContext] = useState<AuthorizeContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaOptions, setMfaOptions] = useState<MfaOptions>(DEFAULT_MFA_OPTIONS);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestReady = Boolean(authorizeRequest && context && !contextError);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      setContext(null);
      setContextError(null);
      if (!authorizeRequest) {
        setContextError(t("oauth.missingDetails"));
        return;
      }

      try {
        const response = await api.authorizeContext({
          client_id: authorizeRequest.client_id,
          redirect_uri: authorizeRequest.redirect_uri,
          scope: authorizeRequest.scope
        });
        if (active) setContext(response);
      } catch (err) {
        if (active) setContextError(apiErrorMessage(err, t("oauth.loadFailed")));
      }
    }

    loadContext();
    return () => { active = false; };
  }, [authorizeRequest, t, user?.id]);

  // Agreeing is saved first: the server only hands a sign-in code to an app the person has allowed.
  async function continueToAuthorize() {
    if (!authorizeRequest || !context) return;
    setBusy(true);
    setError(null);
    try {
      if (context.consent_required !== false) {
        await api.grantAppConsent({
          client_id: authorizeRequest.client_id,
          redirect_uri: authorizeRequest.redirect_uri,
          scope: authorizeRequest.scope
        });
      }
      window.location.href = authorizeRequest.next;
    } catch (err) {
      setError(apiErrorMessage(err, t("oauth.grantFailed")));
      setBusy(false);
    }
  }

  function cancelAuthorize() {
    // The app is only sent a refusal once the server has confirmed the redirect address belongs to it.
    if (authorizeRequest && context) {
      window.location.href = authorizeDenyUrl(authorizeRequest);
      return;
    }
    go("account");
  }

  function handleLoginResponse(response: LoginResponse) {
    if (response.user) {
      onAuthenticated(response.user);
      return;
    }
    if (response.mfa_required && response.challenge_id) {
      setMfaChallenge(response.challenge_id);
      setMfaOptions(mfaOptionsFromResponse(response));
      return;
    }
    if (response.mfa_setup_required && response.mfa_setup) {
      setSetup(response.mfa_setup);
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      handleLoginResponse(await api.login({ email, password }));
    } catch (err) {
      setError(apiErrorMessage(err, t("login.failed")));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("password.tooShort", { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.register({ email, display_name: displayName, password });
      setSetup(response.mfa_setup);
    } catch (err) {
      setError(apiErrorMessage(err, t("register.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OAuthAuthorizeLayout context={context} showScopes={!user} backgroundSrc={backgroundSrc}>
      <Alert message={contextError} />
      {!context && !contextError && <Alert message={t("oauth.loadingRequest")} tone="info" />}
      {loading ? (
        <Alert message={t("oauth.checkingPortalSession")} tone="info" />
      ) : user ? (
        <div className="oauth-consent">
          <div className="oauth-account">
            <Avatar user={user} />
            <div>
              <strong>{user.display_name}</strong>
              <span>{user.email}</span>
            </div>
            <button type="button" className="link-button" onClick={() => void onSwitchAccount()}>
              {t("oauth.switchAccount")}
            </button>
          </div>
          {context && (
            <div className="oauth-scope-list">
              <span>{t("oauth.willAccess", { app: context.client_name })}</span>
              <ul>
                {context.scopes.map((scope) => (
                  <li key={scope}>
                    <SettingIcon name={oauthScopeIcon(scope)} />
                    {oauthScopeLabel(scope, t)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {context && context.consent_required !== false && <p className="dialog-hint">{t("oauth.askedOnce")}</p>}
          <Alert message={error} />
          <div className="button-row">
            <button type="button" className="primary" onClick={() => void continueToAuthorize()} disabled={!requestReady || busy} aria-busy={busy}>
              {t("oauth.continueButton")}
            </button>
            <button type="button" className="secondary" onClick={cancelAuthorize} disabled={busy}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} options={mfaOptions} onAuthenticated={onAuthenticated} />
      ) : mode === "register" ? (
        <>
          <div className="panel-header">
            <h2>{t("oauth.createTitle")}</h2>
            <p>{t("oauth.createBody", { app: context?.client_name ?? t("oauth.connectedApp") })}</p>
          </div>
          <form onSubmit={submitRegister} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} autoComplete="name" required />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" required />
            <PasswordRules rules={[{ met: password.length >= PASSWORD_MIN_LENGTH, label: t("password.ruleLength", { count: PASSWORD_MIN_LENGTH }) }]} />
            <Alert message={error} />
            <button className="primary" disabled={busy || !requestReady} aria-busy={busy}>
              {busy ? t("register.busy") : t("oauth.createSubmit")}
            </button>
          </form>
          <button className="link-button" onClick={() => setMode("login")}>
            {t("register.haveAccount")}
          </button>
        </>
      ) : (
        <>
          <div className="panel-header">
            <h2>{t("oauth.signInTitle")}</h2>
            <p>{t("oauth.signInBody", { product: PRODUCT_NAME })}</p>
          </div>
          <form onSubmit={submitLogin} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
            <Alert message={error} />
            <button className="primary" disabled={busy || !requestReady} aria-busy={busy}>
              {busy ? t("login.busy") : t("oauth.signInSubmit")}
            </button>
          </form>
          <div className="link-stack">
            <button className="link-button" onClick={() => navigateWithNext("forgot-password", next)}>
              {t("login.forgot")}
            </button>
            <button className="link-button" onClick={() => setMode("register")}>
              {t("login.needAccount")}
            </button>
          </div>
        </>
      )}
    </OAuthAuthorizeLayout>
  );
}

function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  // Set once the request is accepted: "email" when a message was sent, "log" when the server only logged the link.
  const [delivery, setDelivery] = useState<"email" | "log" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResetLink(null);
    try {
      const response = await api.forgotPassword({ email });
      setResetLink(response.reset_link ?? null);
      setDelivery(response.delivery === "email" ? "email" : "log");
    } catch (err) {
      setError(apiErrorMessage(err, t("forgot.failed")));
    } finally {
      setBusy(false);
    }
  }

  if (delivery) {
    return (
      <div key="sent" className="motion-page">
        <div className="panel-header">
          <h2>{t(delivery === "email" ? "forgot.sentEmailTitle" : "forgot.sentTitle")}</h2>
          <p>{t(delivery === "email" ? "forgot.sentEmailBody" : "forgot.sentBody", { email: email.trim() })}</p>
        </div>
        <div className="form-stack">
          {resetLink && (
            <div className="dev-reset-link">
              <span>{t("forgot.devLink")}</span>
              <button type="button" onClick={() => { window.location.href = resetLink; }}>
                {resetLink}
              </button>
            </div>
          )}
          <button type="button" className="primary" onClick={() => go("login")}>
            {t("common.backToSignIn")}
          </button>
        </div>
        <button className="link-button" onClick={() => { setDelivery(null); setResetLink(null); }}>
          {t("forgot.tryAnother")}
        </button>
      </div>
    );
  }

  return (
    <div key="request" className="motion-page">
      <div className="panel-header">
        <h2>{t("forgot.title")}</h2>
        <p>{t("forgot.body")}</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <Alert message={error} />
        <button className="primary" disabled={busy} aria-busy={busy}>
          {busy ? t("forgot.busy") : t("forgot.submit")}
        </button>
      </form>
      <button className="link-button" onClick={() => go("login")}>
        {t("common.backToSignIn")}
      </button>
    </div>
  );
}

function ResetPasswordPage() {
  const { t } = useI18n();
  const token = resetToken();
  const [inspect, setInspect] = useState<ResetPasswordInspectResponse | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function inspectToken() {
      setLoadingInspect(true);
      setError(null);
      setMessage(null);
      if (!token) {
        setInspect({ valid: false, mfa_required: false });
        setLoadingInspect(false);
        return;
      }

      try {
        const response = await api.inspectPasswordReset({ token });
        if (active) setInspect(response);
      } catch (err) {
        if (active) setError(apiErrorMessage(err, t("reset.inspectFailed")));
      } finally {
        if (active) setLoadingInspect(false);
      }
    }

    inspectToken();
    return () => { active = false; };
  }, [token, t]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !inspect?.valid) return;
    if (newPassword !== confirmPassword) {
      setError(t("reset.passwordMismatch"));
      return;
    }
    const normalizedMfaCode = optionalText(mfaCode);
    if (inspect.mfa_required && !normalizedMfaCode) {
      setError(t("reset.mfaRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.completePasswordReset({
        token,
        new_password: newPassword,
        ...(normalizedMfaCode ? { mfa_code: normalizedMfaCode } : {})
      });
      setNewPassword("");
      setConfirmPassword("");
      setMfaCode("");
      setMessage(t("reset.success"));
    } catch (err) {
      setError(apiErrorMessage(err, t("reset.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="motion-page">
      <div className="panel-header">
        <h2>{t("reset.title")}</h2>
        <p>{t("reset.body", { product: PRODUCT_NAME })}</p>
      </div>
      {loadingInspect ? (
        <Alert message={t("reset.checking")} tone="info" />
      ) : !inspect?.valid ? (
        <>
          <Alert message={t("reset.invalid")} />
          <button className="link-button" onClick={() => go("forgot-password")}>
            {t("reset.requestNew")}
          </button>
        </>
      ) : message ? (
        <>
          <Alert message={message} tone="success" />
          <button className="primary" onClick={() => go("login")}>
            {t("common.signIn")}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <Field label={t("common.newPassword")} type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" required />
          <PasswordRules rules={[{ met: newPassword.length >= PASSWORD_MIN_LENGTH, label: t("password.ruleLength", { count: PASSWORD_MIN_LENGTH }) }]} />
          <Field label={t("reset.confirmPassword")} type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" required />
          {inspect.mfa_required && (
            <>
              <CodeField
                label={t("reset.codeOrBackup")}
                value={mfaCode}
                onChange={setMfaCode}
                length={BACKUP_CODE_LENGTH}
                minLength={VERIFICATION_CODE_LENGTH}
              />
              <div className="field-help">{t("reset.mfaHelp")}</div>
            </>
          )}
          <Alert message={error} />
          <button className="primary" disabled={busy} aria-busy={busy}>
            {busy ? t("reset.busy") : t("reset.submit")}
          </button>
        </form>
      )}
    </div>
  );
}

// ###############################################
// Verification Screens
// ###############################################

async function confirmedSessionUser(t: I18nContextValue["t"]) {
  try {
    return await api.me();
  } catch {
    throw new Error(t("mfa.sessionConfirmFailed"));
  }
}

// `length` is the longest code accepted. Pass `minLength` when a shorter code is valid too.
function CodeField({
  label,
  value,
  onChange,
  length = VERIFICATION_CODE_LENGTH,
  minLength = length,
  autoFocus = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  minLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="field code-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${minLength},${length}}`}
        maxLength={length}
        placeholder={"0".repeat(length)}
        autoFocus={autoFocus}
        required
      />
    </label>
  );
}

// The server hands a code back only when email is off and the site runs on localhost.
function DevCodeNote({ code }: { code: string | null }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <div className="dev-reset-link">
      <span>{t("code.devCode")}</span>
      <code>{code}</code>
    </div>
  );
}

function MfaSetupPanel({
  setup,
  onAuthenticated,
  onCancel
}: {
  setup: MfaSetup;
  onAuthenticated: (user: User) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groupedKey = setup.manual_entry_key.replace(/(.{4})/g, "$1 ").trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaSetup({ challenge_id: setup.challenge_id, code });
      if (response.user) onAuthenticated(await confirmedSessionUser(t));
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : apiErrorMessage(err, t("mfa.setupFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(setup.manual_entry_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("mfa.copyFailed"));
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>{t("mfa.setupTitle")}</h2>
      </div>
      <ol className="setup-steps">
        <li>
          <strong>{t("mfa.stepInstall")}</strong>
          <p>{t("mfa.stepInstallBody")}</p>
        </li>
        <li>
          <strong>{t("mfa.stepScan")}</strong>
          <div className="setup-scan">
            <div className="qr-wrap">
              <img src={setup.qr_code_data_url} alt={t("mfa.qrAlt")} />
            </div>
            <div className="setup-key-block">
              <code className="setup-key">{groupedKey}</code>
              <button type="button" className="secondary" onClick={copyKey}>
                {copied ? t("mfa.keyCopied") : t("mfa.copyKey")}
              </button>
            </div>
          </div>
        </li>
        <li>
          <strong>{t("mfa.stepCode")}</strong>
          <form onSubmit={submit} className="form-stack">
            <CodeField label={t("common.verificationCode")} value={code} onChange={setCode} />
            <Alert message={error} />
            <div className="button-row">
              <button className="primary" disabled={busy} aria-busy={busy}>
                {busy ? t("mfa.verifying") : t("mfa.finishSetup")}
              </button>
              {onCancel && (
                <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
                  {t("common.cancel")}
                </button>
              )}
            </div>
          </form>
        </li>
      </ol>
    </>
  );
}

type MfaOptions = { methods: MfaMethod[]; recoveryEmailHint: string | null };

const DEFAULT_MFA_OPTIONS: MfaOptions = { methods: ["totp"], recoveryEmailHint: null };

function mfaOptionsFromResponse(response: LoginResponse): MfaOptions {
  return {
    methods: response.mfa_methods?.length ? response.mfa_methods : ["totp"],
    recoveryEmailHint: response.recovery_email_hint ?? null
  };
}

function MfaVerifyPanel({
  challengeId,
  options = DEFAULT_MFA_OPTIONS,
  onAuthenticated
}: {
  challengeId: string;
  options?: MfaOptions;
  onAuthenticated: (user: User) => void;
}) {
  const { t } = useI18n();
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [choosing, setChoosing] = useState(false);
  // True once another method was picked, so the new code field takes focus.
  const [switched, setSwitched] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recoveryEmail = options.recoveryEmailHint ?? "";
  const alternatives = options.methods.filter((item) => item !== method);

  const copyByMethod: Record<MfaMethod, { title: string; body: string; label: string; length: number }> = {
    totp: { title: t("mfa.verifyTitle"), body: t("mfa.verifyBody"), label: t("common.verificationCode"), length: VERIFICATION_CODE_LENGTH },
    backup_code: { title: t("mfa.backupTitle"), body: t("mfa.backupBody"), label: t("mfa.backupLabel"), length: BACKUP_CODE_LENGTH },
    recovery_email: {
      title: t("mfa.recoveryTitle"),
      body: t("code.sentTo", { email: recoveryEmail }),
      label: t("common.verificationCode"),
      length: VERIFICATION_CODE_LENGTH
    }
  };
  const methodChoices: Record<MfaMethod, { label: string; icon: SettingIconName }> = {
    totp: { label: t("mfa.methodTotp"), icon: "shield" },
    backup_code: { label: t("mfa.methodBackup"), icon: "lifebuoy" },
    recovery_email: { label: t("mfa.methodRecoveryEmail", { email: recoveryEmail }), icon: "mail" }
  };
  const copy = copyByMethod[method];

  async function chooseMethod(next: MfaMethod) {
    setChoosing(false);
    setSwitched(true);
    setCode("");
    setError(null);
    setDevCode(null);
    if (next !== "recovery_email") {
      setMethod(next);
      return;
    }
    // The code is requested only once this option is picked, so no email goes out unasked.
    setBusy(true);
    try {
      const sent = await api.sendRecoverySignInCode(challengeId);
      setDevCode(sent.dev_code ?? null);
      setMethod(next);
    } catch (err) {
      setError(apiErrorMessage(err, t("code.sendFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaLogin({ challenge_id: challengeId, code, method });
      if (response.user) onAuthenticated(await confirmedSessionUser(t));
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : apiErrorMessage(err, t("mfa.verifyFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <DevCodeNote code={devCode} />
        <CodeField key={method} label={copy.label} value={code} onChange={setCode} length={copy.length} autoFocus={switched} />
        <Alert message={error} />
        <button className="primary" disabled={busy} aria-busy={busy}>
          {busy ? t("mfa.verifying") : t("mfa.verifyContinue")}
        </button>
      </form>
      {alternatives.length > 0 && (
        <div className="mfa-alternatives">
          <button type="button" className="link-button" aria-expanded={choosing} onClick={() => setChoosing((open) => !open)} disabled={busy}>
            {t("mfa.tryAnotherWay")}
          </button>
          {choosing && (
            <div className="mfa-method-list">
              {alternatives.map((item) => (
                <button type="button" key={item} className="mfa-method" onClick={() => void chooseMethod(item)}>
                  <SettingIcon name={methodChoices[item].icon} />
                  <span>{methodChoices[item].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ###############################################
// Profile Onboarding
// ###############################################

function onboardingCopy(field: ProfilePromptField, t: I18nContextValue["t"]) {
  const copy: Record<ProfilePromptField, { title: string; label: string; helper: string; placeholder?: string; type?: string; inputMode?: "tel" | "text" }> = {
    phone_number: {
      title: t("onboarding.phoneTitle"),
      label: t("onboarding.phoneLabel"),
      helper: t("onboarding.phoneHelper"),
      placeholder: "+1 555 123 4567",
      type: "tel",
      inputMode: "tel"
    },
    gender: {
      title: t("onboarding.genderTitle"),
      label: t("common.gender"),
      helper: t("onboarding.genderHelper")
    },
    date_of_birth: {
      title: t("onboarding.birthdayTitle"),
      label: t("onboarding.birthdayLabel"),
      helper: t("onboarding.birthdayHelper"),
      type: "date"
    },
    first_name: {
      title: t("onboarding.firstNameTitle"),
      label: t("onboarding.firstNameLabel"),
      helper: t("onboarding.firstNameHelper"),
      placeholder: t("onboarding.firstNameLabel"),
      type: "text",
      inputMode: "text"
    },
    last_name: {
      title: t("onboarding.lastNameTitle"),
      label: t("onboarding.lastNameLabel"),
      helper: t("onboarding.lastNameHelper"),
      placeholder: t("onboarding.lastNameLabel"),
      type: "text",
      inputMode: "text"
    }
  };
  return copy[field];
}

function PhoneField({
  label,
  dialCode,
  number,
  onDialCodeChange,
  onNumberChange
}: {
  label: string;
  dialCode: string;
  number: string;
  onDialCodeChange: (dialCode: string) => void;
  onNumberChange: (number: string) => void;
}) {
  const { t, locale } = useI18n();
  const dialCodeOptions = useMemo(
    () => DIAL_CODES.map((item) => ({ value: item.code, label: dialCodeLabel(item.code, item.region, locale) })),
    [locale]
  );

  return (
    <div className="field phone-field">
      <span>{label}</span>
      <div className="phone-field-controls">
        <select aria-label={t("profile.dialCode")} value={dialCode} onChange={(event) => onDialCodeChange(event.target.value)}>
          {dialCodeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="">{t("profile.dialCodeOther")}</option>
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete={dialCode ? "tel-national" : "tel"}
          aria-label={label}
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
          placeholder={dialCode ? "12 345 6789" : "+60 12 345 6789"}
        />
      </div>
    </div>
  );
}

function ProfileOnboardingPanel({
  user,
  setUser,
  onFinished
}: {
  user: User;
  setUser: (user: User) => void;
  onFinished: () => void;
}) {
  const { t } = useI18n();
  const completion = user.profile_completion;
  const field = completion.next_prompt_field;
  const genderOptions = GENDER_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  const [value, setValue] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [gender, setGender] = useState<GenderValue | "">("");
  const [genderCustom, setGenderCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  // The step count is fixed when the prompt opens, so the bar fills up as answers are saved or skipped.
  const remainingSteps = completion.missing_fields.filter((item) => !completion.skipped_fields.includes(item)).length;
  const totalSteps = useRef(Math.max(remainingSteps, 1));
  if (remainingSteps > totalSteps.current) totalSteps.current = remainingSteps;
  const currentStep = Math.min(totalSteps.current - remainingSteps + 1, totalSteps.current);

  useEffect(() => {
    setError(null);
    setSessionExpired(false);
    if (!field) {
      setValue("");
      return;
    }
    if (field === "gender") {
      setGender(user.gender ?? "");
      setGenderCustom(user.gender_custom ?? "");
      return;
    }
    if (field === "phone_number") {
      const phone = splitPhoneNumber(user.phone_number);
      setDialCode(phone.dialCode);
      setValue(phone.number);
      return;
    }
    setValue((user[field] as string | null) ?? "");
  }, [field, user]);

  async function completeAndContinue(nextUser: User) {
    if (nextUser.profile_completion.next_prompt_field) {
      setUser(nextUser);
      return;
    }
    const completed = await api.completeProfileOnboarding();
    setUser(completed);
    onFinished();
  }

  function handleOnboardingError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      setSessionExpired(true);
      setError(t("onboarding.sessionExpired"));
      return;
    }
    setError(apiErrorMessage(err, fallback));
  }

  async function saveStep(event: FormEvent) {
    event.preventDefault();
    if (!field) return;
    setError(null);
    setSessionExpired(false);

    let payload: ProfileUpdatePayload;
    if (field === "gender") {
      if (!gender) {
        setError(t("onboarding.chooseGenderError"));
        return;
      }
      if (gender === "custom" && !optionalText(genderCustom)) {
        setError(t("onboarding.customGenderError"));
        return;
      }
      payload = {
        gender,
        gender_custom: gender === "custom" ? optionalText(genderCustom) : null
      };
    } else if (field === "phone_number") {
      if (!isValidPhoneNumber(dialCode, value)) {
        setError(t("profile.phoneInvalid"));
        return;
      }
      payload = { phone_number: joinPhoneNumber(dialCode, value) };
    } else {
      const nextValue = optionalText(value);
      if (!nextValue) {
        setError(t("onboarding.enterOrSkip", { field: onboardingCopy(field, t).label.toLowerCase() }));
        return;
      }
      payload = { [field]: nextValue } as ProfileUpdatePayload;
    }

    setBusy(true);
    try {
      await completeAndContinue(await api.updateProfile(payload));
    } catch (err) {
      handleOnboardingError(err, t("onboarding.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Skipping only passes over this one detail; the remaining questions still follow.
  async function skipStep() {
    if (!field) return;
    setBusy(true);
    setError(null);
    setSessionExpired(false);
    try {
      await completeAndContinue(await api.skipProfileOnboarding(field));
    } catch (err) {
      handleOnboardingError(err, t("onboarding.skipFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function finishWithoutPrompt() {
    setBusy(true);
    setError(null);
    setSessionExpired(false);
    try {
      await completeAndContinue(user);
    } catch (err) {
      handleOnboardingError(err, t("onboarding.completeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!field) {
    return (
      <>
        <div className="panel-header">
          <h2>{t("onboarding.readyTitle")}</h2>
          <p>{t("onboarding.readyBody")}</p>
        </div>
        <Alert message={error} />
        {sessionExpired && (
          <button type="button" className="secondary" onClick={() => go("login")}>
            {t("common.backToSignIn")}
          </button>
        )}
        <button className="primary" onClick={finishWithoutPrompt} disabled={busy} aria-busy={busy}>
          {busy ? t("onboarding.finishing") : t("common.continue")}
        </button>
      </>
    );
  }

  const copy = onboardingCopy(field, t);
  const stepLabel = t("onboarding.stepOf", { step: currentStep, total: totalSteps.current });

  return (
    <>
      <div className="panel-header">
        <h2>{copy.title}</h2>
        <p>{copy.helper}</p>
      </div>
      <div className="step-progress" role="progressbar" aria-label={stepLabel} aria-valuemin={1} aria-valuemax={totalSteps.current} aria-valuenow={currentStep}>
        {Array.from({ length: totalSteps.current }).map((_, index) => (
          <span key={index} className={index < currentStep ? "done" : undefined} />
        ))}
      </div>
      <div className="onboarding-progress">{stepLabel}</div>
      <form onSubmit={saveStep} className="form-stack">
        {field === "gender" ? (
          <>
            <SelectField<GenderValue>
              label={copy.label}
              value={gender}
              onChange={setGender}
              options={genderOptions}
              placeholder={t("common.selectOption")}
            />
            {gender === "custom" && (
              <Field
                label={t("onboarding.customGender")}
                value={genderCustom}
                onChange={setGenderCustom}
                placeholder={t("onboarding.customGenderPlaceholder")}
              />
            )}
          </>
        ) : field === "phone_number" ? (
          <PhoneField label={copy.label} dialCode={dialCode} number={value} onDialCodeChange={setDialCode} onNumberChange={setValue} />
        ) : field === "date_of_birth" ? (
          <label className="field">
            <span>{copy.label}</span>
            <input type="date" value={value} max={todayIsoDate()} onChange={(event) => setValue(event.target.value)} />
          </label>
        ) : (
          <Field
            label={copy.label}
            type={copy.type}
            inputMode={copy.inputMode}
            value={value}
            onChange={setValue}
            placeholder={copy.placeholder}
          />
        )}
        <Alert message={error} />
        {sessionExpired && (
          <button type="button" className="secondary" onClick={() => go("login")}>
            {t("common.backToSignIn")}
          </button>
        )}
        <div className="button-row">
          <button className="primary" disabled={busy} aria-busy={busy}>
            {busy ? t("common.saving") : t("onboarding.saveContinue")}
          </button>
          <button type="button" className="secondary" onClick={skipStep} disabled={busy}>
            {t("onboarding.skipThis")}
          </button>
        </div>
      </form>
    </>
  );
}

function ProfileOnboardingPage({
  user,
  setUser,
  onFinished
}: {
  user: User;
  setUser: (user: User) => void;
  onFinished: () => void;
}) {
  return (
    <div className="motion-page">
      <ProfileOnboardingPanel user={user} setUser={setUser} onFinished={onFinished} />
    </div>
  );
}

// ###############################################
// Security Checkup
// ###############################################

const DAY_MS = 86_400_000;
// A sign-in from a device the account had not used before stays flagged for this long.
const NEW_DEVICE_WINDOW_DAYS = 7;
// An app that has not been opened for this long is worth a second look.
const UNUSED_APP_DAYS = 90;
const LOW_BACKUP_CODES = 2;

type CheckupStatus = "ok" | "attention" | "unknown";

type CheckupItem = {
  id: string;
  status: CheckupStatus;
  title: string;
  detail: string;
  // Named only when there is something to do.
  action?: string;
  run: () => void;
};

// Each list is null while it loads, or when it could not be loaded.
type CheckupData = {
  sessions: SessionInfo[] | null;
  events: SecurityEvent[] | null;
  apps: ConnectedApp[] | null;
};

function buildSecurityCheckup(
  user: User,
  data: CheckupData,
  t: I18nContextValue["t"],
  locale: string,
  openSection: (section: SecuritySection) => void = goSecuritySection
): CheckupItem[] {
  const now = Date.now();
  const items: CheckupItem[] = [];

  items.push({
    id: "password",
    status: "ok",
    title: t("common.password"),
    detail: user.password_changed_at
      ? t("checkup.passwordChanged", { when: formatRelativeTime(user.password_changed_at, locale) })
      : t("account.passwordDesc"),
    run: () => openSection("password")
  });

  items.push({
    id: "verification",
    status: user.mfa_enabled ? "ok" : "attention",
    title: t("common.extraVerification"),
    detail: user.mfa_enabled ? t("checkup.verificationOn") : t("checkup.verificationOff"),
    action: user.mfa_enabled ? undefined : t("checkup.turnOn"),
    run: () => openSection("verification")
  });

  // Backup codes and the recovery email stand in for the authenticator app, so they matter only once it is on.
  if (user.mfa_enabled) {
    const codes = user.backup_codes_remaining;
    const hasRecoveryEmail = Boolean(user.recovery_email);
    const recovery = { id: "recovery", title: t("checkup.recoveryTitle"), run: () => openSection("backup-codes") };
    if (codes === 0 && !hasRecoveryEmail) {
      items.push({ ...recovery, status: "attention", detail: t("checkup.recoveryNone"), action: t("checkup.setUp") });
    } else if (codes <= LOW_BACKUP_CODES && !hasRecoveryEmail) {
      items.push({ ...recovery, status: "attention", detail: t("checkup.recoveryLow", { count: codes }), action: t("checkup.review") });
    } else {
      const detail = codes > 0 && hasRecoveryEmail
        ? t("checkup.recoveryBoth", { count: codes })
        : hasRecoveryEmail
          ? t("checkup.recoveryEmailOnly")
          : t("checkup.recoveryCodesOnly", { count: codes });
      items.push({ ...recovery, status: "ok", detail });
    }
  }

  items.push({
    id: "email",
    status: user.email_verified ? "ok" : "attention",
    title: t("checkup.emailTitle"),
    detail: user.email_verified ? t("common.verified") : t("checkup.emailNotVerified"),
    action: user.email_verified ? undefined : t("checkup.verify"),
    run: () => goProfileEdit("email")
  });

  const devices = { id: "devices", title: t("checkup.devicesTitle"), run: () => openSection("sessions") };
  if (!data.sessions) {
    items.push({ ...devices, status: "unknown", detail: t("checkup.unknown") });
  } else {
    const newDeviceSignIns = (data.events ?? []).filter((event) =>
      event.event_type === "login_success" &&
      event.metadata?.new_device === true &&
      now - new Date(event.created_at).getTime() < NEW_DEVICE_WINDOW_DAYS * DAY_MS
    ).length;
    if (newDeviceSignIns > 0) {
      items.push({
        ...devices,
        status: "attention",
        detail: t(newDeviceSignIns === 1 ? "checkup.newDeviceOne" : "checkup.newDeviceMany", { count: newDeviceSignIns, days: NEW_DEVICE_WINDOW_DAYS }),
        action: t("checkup.review")
      });
    } else {
      const count = data.sessions.length;
      items.push({ ...devices, status: "ok", detail: t(count === 1 ? "checkup.devicesOne" : "checkup.devicesMany", { count }) });
    }
  }

  const apps = { id: "apps", title: t("checkup.appsTitle"), run: () => go("connected-apps") };
  if (!data.apps) {
    items.push({ ...apps, status: "unknown", detail: t("checkup.unknown") });
  } else if (data.apps.length === 0) {
    items.push({ ...apps, status: "ok", detail: t("checkup.appsNone") });
  } else {
    const unused = data.apps.filter((app) => now - new Date(app.last_used_at ?? app.granted_at).getTime() > UNUSED_APP_DAYS * DAY_MS).length;
    if (unused > 0) {
      items.push({
        ...apps,
        status: "attention",
        detail: t(unused === 1 ? "checkup.appsUnusedOne" : "checkup.appsUnusedMany", { count: unused, days: UNUSED_APP_DAYS }),
        action: t("checkup.review")
      });
    } else {
      const count = data.apps.length;
      items.push({ ...apps, status: "ok", detail: t(count === 1 ? "apps.countOne" : "apps.countMany", { count }) });
    }
  }

  return items;
}

// Items that could not be checked are left out of the count instead of being reported as passed.
function checkupSummary(items: CheckupItem[]) {
  const checked = items.filter((item) => item.status !== "unknown");
  const attention = checked.filter((item) => item.status === "attention");
  return { total: checked.length, done: checked.length - attention.length, attention };
}

function checkupHeadline(attentionCount: number, t: I18nContextValue["t"]) {
  if (attentionCount === 0) return t("checkup.allGood");
  return t(attentionCount === 1 ? "checkup.suggestionOne" : "checkup.suggestionMany", { count: attentionCount });
}

function SecurityCheckup({ items }: { items: CheckupItem[] }) {
  const { t } = useI18n();
  const summary = checkupSummary(items);

  return (
    <div className="settings-section">
      <h2>{t("checkup.title")}</h2>
      <p>
        {checkupHeadline(summary.attention.length, t)} · {t("checkup.progress", { done: summary.done, total: summary.total })}
      </p>
      <div className="settings-group stacked-rows">
        {items.map((item) => (
          <button key={item.id} type="button" className={`settings-row checkup-row ${item.status}`} onClick={item.run}>
            <span className="settings-row-icon checkup-status">
              <SettingIcon name={item.status === "attention" ? "alert" : item.status === "ok" ? "check-circle" : "clock"} />
              <span className="visually-hidden">
                {t(item.status === "attention" ? "checkup.statusAttention" : item.status === "ok" ? "checkup.statusOk" : "checkup.unknown")}
              </span>
            </span>
            <span className="settings-row-copy">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </span>
            <span className="settings-row-right">
              {item.action && <span className="checkup-action">{item.action}</span>}
              <ChevronIcon />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The home page version: one card with the count, a progress bar, and the open suggestions.
function CheckupCard({ items, children }: { items: CheckupItem[]; children?: ReactNode }) {
  const { t } = useI18n();
  const { total, done, attention } = checkupSummary(items);
  const good = attention.length === 0;

  return (
    <div className={`status-card ${good ? "status-card-good" : "status-card-attention"}`}>
      <div className="status-card-main">
        <span className="status-card-icon">
          <SettingIcon name={good ? "shield" : "alert"} />
        </span>
        <div className="status-card-copy">
          <strong>{good ? t("checkup.cardGood") : t("checkup.cardTitle", { headline: checkupHeadline(attention.length, t) })}</strong>
          <span>{t("checkup.progress", { done, total })}</span>
        </div>
        <button type="button" className={good ? "secondary" : "primary"} onClick={() => go("security")}>
          {good ? t("checkup.viewButton") : t("checkup.startButton")}
        </button>
      </div>
      <div
        className="checkup-progress"
        role="progressbar"
        aria-label={t("checkup.title")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </div>
      {attention.length > 0 && (
        <ul className="checkup-issues">
          {attention.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={item.run}>
                <SettingIcon name="alert" />
                <span>{t("checkup.issueLine", { title: item.title, detail: item.detail })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

// ###############################################
// Account Screens
// ###############################################

type EntryItem = {
  icon: SettingIconName;
  title: string;
  description: string;
  onClick: () => void;
};

function EntryGroup({ label, entries }: { label: string; entries: EntryItem[] }) {
  return (
    <div className="entry-group">
      <h2>{label}</h2>
      <div className="entry-list">
        {entries.map((entry) => (
          <button key={entry.title} type="button" className="entry-row" onClick={entry.onClick}>
            <span className="entry-row-icon">
              <SettingIcon name={entry.icon} />
            </span>
            <span className="entry-row-copy">
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </span>
            <ChevronIcon />
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountHomePage({ user }: { user: User }) {
  const { t, locale } = useI18n();
  const chrome = useChrome();
  // Each list loads on its own: one that fails leaves its part of the checkup unchecked instead of hiding the rest.
  const [overview, setOverview] = useState<CheckupData>({ sessions: null, events: null, apps: null });

  useEffect(() => {
    let active = true;
    const load = <K extends keyof CheckupData>(key: K, request: Promise<NonNullable<CheckupData[K]>>) => {
      request
        .then((value) => {
          if (active) setOverview((current) => ({ ...current, [key]: value }));
        })
        .catch(() => undefined);
    };
    load("sessions", api.listSessions());
    load("events", api.listSecurityEvents());
    load("apps", api.listConnectedApps());
    return () => { active = false; };
  }, []);

  const checkupItems = buildSecurityCheckup(user, overview, t, locale);
  const lastSignIn = overview.events?.find((event) => event.event_type === "login_success")?.created_at ?? null;
  const sessionCount = overview.sessions?.length ?? null;
  const sessionCountLabel = sessionCount === null
    ? "—"
    : t(sessionCount === 1 ? "home.deviceOne" : "home.deviceMany", { count: sessionCount });

  const accountEntries: EntryItem[] = [
    { icon: "id", title: t("nav.personalInfo"), description: t("account.personalInfoDesc"), onClick: () => go("profile") },
    { icon: "shield", title: t("nav.security"), description: t("account.securityDesc"), onClick: () => go("security") },
    { icon: "database", title: t("nav.dataPrivacy"), description: t("account.dataPrivacyDesc"), onClick: () => go("data-privacy") },
    { icon: "apps", title: t("nav.connectedApps"), description: t("account.connectedAppsDesc"), onClick: () => go("connected-apps") }
  ];
  const shortcutEntries: EntryItem[] = [
    { icon: "key", title: t("security.changePassword"), description: t("account.passwordDesc"), onClick: () => goSecuritySection("password") },
    { icon: "devices", title: t("common.activeSessions"), description: t("account.sessionsDesc"), onClick: () => goSecuritySection("sessions") },
    { icon: "activity", title: t("account.activityTitle"), description: t("account.activityDesc"), onClick: () => goSecuritySection("activity") }
  ];

  return (
    <section className="home-overview">
      <div className="home-profile">
        <button type="button" className="home-profile-avatar" aria-label={t("avatar.change")} onClick={chrome.openPictureModal}>
          <Avatar user={user} />
          <span aria-hidden="true">
            <CameraIcon />
          </span>
        </button>
        <div className="home-profile-copy">
          <h1>{user.display_name}</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <CheckupCard items={checkupItems}>
        <div className="status-metrics">
          <button type="button" className="status-metric" onClick={() => goSecuritySection("verification")}>
            <span>{t("common.extraVerification")}</span>
            <strong className={user.mfa_enabled ? "good" : "attention"}>{user.mfa_enabled ? t("security.on") : t("security.off")}</strong>
          </button>
          <button type="button" className="status-metric" onClick={() => goSecuritySection("sessions")}>
            <span>{t("common.activeSessions")}</span>
            <strong>{sessionCountLabel}</strong>
          </button>
          <button type="button" className="status-metric" onClick={() => goSecuritySection("activity")}>
            <span>{t("home.lastSignIn")}</span>
            <strong>{lastSignIn ? formatDayTime(lastSignIn, locale) : "—"}</strong>
          </button>
        </div>
      </CheckupCard>

      <div className="entry-groups">
        <EntryGroup label={t("account.accountGroup")} entries={accountEntries} />
        <EntryGroup label={t("home.shortcuts")} entries={shortcutEntries} />
      </div>

      <p className="home-note">{t("account.privacy")}</p>
    </section>
  );
}

function ProfilePage({ user }: { user: User }) {
  const { t, locale } = useI18n();
  const chrome = useChrome();
  const phoneValue = user.phone_number
    ? `${user.phone_number} · ${user.phone_verified ? t("common.verified") : t("profile.phoneNotVerified")}`
    : t("common.notAdded");

  return (
    <SettingsPage title={t("profile.title")}>
      <div className="settings-section profile-avatar-section">
        <h2 className="mobile-settings-label">{t("profile.avatarSection")}</h2>
        <div className="settings-group">
          <SettingsRow icon="camera" title={t("common.profilePicture")} right={<Avatar user={user} />} onClick={chrome.openPictureModal} />
        </div>
      </div>
      <div className="settings-section">
        <h2 className="mobile-settings-label">{t("profile.personalSection")}</h2>
        <div className="settings-group">
          <SettingsRow icon="id" title={t("common.name")} value={fullName(user)} onClick={() => goProfileEdit("name")} />
          <SettingsRow
            icon="user"
            title={t("common.gender")}
            value={user.gender === "custom" ? displayValue(user.gender_custom, t("common.notSet")) : genderLabel(user.gender, t)}
            onClick={() => goProfileEdit("gender")}
          />
          <SettingsRow
            icon="mail"
            title={t("common.email")}
            value={user.email}
            right={
              <span className={`status-badge ${user.email_verified ? "good" : "attention"}`}>
                {user.email_verified ? t("common.verified") : t("profile.emailNotVerified")}
              </span>
            }
            onClick={() => goProfileEdit("email")}
          />
          <SettingsRow icon="phone" title={t("common.phone")} value={phoneValue} onClick={() => goProfileEdit("phone")} />
          <SettingsRow
            icon="cake"
            title={t("common.birthday")}
            value={user.date_of_birth ? formatCalendarDate(user.date_of_birth, locale) : t("common.notSet")}
            onClick={() => goProfileEdit("birthday")}
          />
        </div>
      </div>
      <div className="settings-section">
        <h2 className="mobile-settings-label">{t("profile.preferenceSection")}</h2>
        <div className="settings-group">
          <SettingsRow icon="globe" title={t("common.language")} value={primaryLanguage(user, t("common.notSet"))} onClick={() => goProfileEdit("language")} />
          <SettingsRow
            icon="clock"
            title={t("common.timezone")}
            value={user.timezone ? timeZoneLabel(user.timezone) : t("common.notSet")}
            onClick={() => goProfileEdit("timezone")}
          />
        </div>
      </div>
    </SettingsPage>
  );
}

const CODE_RESEND_SECONDS = 60;

function EmailVerificationCard({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const { t } = useI18n();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.startEmailVerification();
      setDevCode(sent.dev_code ?? null);
      setCodeSent(true);
      setCode("");
      setResendIn(CODE_RESEND_SECONDS);
    } catch (err) {
      setError(apiErrorMessage(err, t("code.sendFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault();
    if (user.email_verified || !codeSent) return;
    setBusy(true);
    setError(null);
    try {
      setUser(await api.confirmEmailVerification(code));
    } catch (err) {
      setError(apiErrorMessage(err, t("code.verifyFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-edit-card" onSubmit={confirmCode}>
      <div className="profile-edit-card-copy">
        <span>{user.email_verified ? t("common.verified") : t("profile.emailNotVerified")}</span>
        <p>{t("email.body")}</p>
      </div>
      <div className="profile-edit-fields">
        <div className="field">
          <span>{t("common.email")}</span>
          <div className="readonly-value">{user.email}</div>
        </div>
        {user.email_verified ? (
          <Alert message={t("email.verifiedNote")} tone="success" />
        ) : codeSent && (
          <>
            <div className="field-help">{t("code.sentTo", { email: user.email })}</div>
            <DevCodeNote code={devCode} />
            <CodeField label={t("common.verificationCode")} value={code} onChange={setCode} />
          </>
        )}
      </div>
      <Alert message={error} />
      <div className="button-row profile-edit-actions">
        {user.email_verified ? (
          <button type="button" className="primary" onClick={() => go("profile")}>
            {t("profile.backToPersonalInfo")}
          </button>
        ) : codeSent ? (
          <>
            <button className="primary" disabled={busy} aria-busy={busy}>
              {t("code.verify")}
            </button>
            <button type="button" className="secondary" onClick={() => void sendCode()} disabled={busy || resendIn > 0}>
              {resendIn > 0 ? t("code.resendIn", { seconds: resendIn }) : t("code.resend")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary" onClick={() => void sendCode()} disabled={busy} aria-busy={busy}>
              {t("email.send")}
            </button>
            <button type="button" className="secondary" onClick={() => go("profile")} disabled={busy}>
              {t("common.cancel")}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function ProfileEditPage({
  user,
  setUser,
  field
}: {
  user: User;
  setUser: (user: User) => void;
  field: ProfileEditField;
}) {
  const { t, locale, setLanguage } = useI18n();
  const initialPhone = useMemo(() => splitPhoneNumber(user.phone_number), [user.phone_number]);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [dialCode, setDialCode] = useState(initialPhone.dialCode);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [gender, setGender] = useState<GenderValue | "">(user.gender ?? "");
  const [genderCustom, setGenderCustom] = useState(user.gender_custom ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.date_of_birth ?? "");
  const [languageChoice, setLanguageChoice] = useState<SupportedLanguage>(() => resolveSupportedLanguage(user.locale));
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detectedTimeZone = useMemo(() => browserTimeZone(), []);
  const timeZoneOptions = useMemo(() => {
    const zones = listTimeZones();
    const withSaved = user.timezone && !zones.includes(user.timezone) ? [user.timezone, ...zones] : zones;
    return withSaved.map((zone) => ({ value: zone, label: timeZoneLabel(zone) }));
  }, [user.timezone]);
  const currentTime = timezone ? formatNowInTimeZone(timezone, locale) : null;

  // Verifying the email address is its own flow, not a value saved with this form.
  if (field === "email") return <EmailVerificationCard user={user} setUser={setUser} />;

  function buildPayload(): ProfileUpdatePayload | null {
    if (field === "name") {
      if (!displayName.trim()) {
        setError(t("profile.displayNameRequired"));
        return null;
      }
      return {
        display_name: displayName.trim(),
        first_name: optionalText(firstName),
        last_name: optionalText(lastName)
      };
    }
    if (field === "gender") {
      if (gender === "custom" && !optionalText(genderCustom)) {
        setError(t("profile.customGenderRequired"));
        return null;
      }
      return {
        gender: gender || null,
        gender_custom: gender === "custom" ? optionalText(genderCustom) : null
      };
    }
    if (field === "phone") {
      if (phoneNumber.trim() && !isValidPhoneNumber(dialCode, phoneNumber)) {
        setError(t("profile.phoneInvalid"));
        return null;
      }
      return { phone_number: joinPhoneNumber(dialCode, phoneNumber) };
    }
    if (field === "birthday") {
      if (dateOfBirth && dateOfBirth > todayIsoDate()) {
        setError(t("profile.birthdayFuture"));
        return null;
      }
      return { date_of_birth: optionalText(dateOfBirth) };
    }
    if (field === "language") return { locale: localeForLanguage(languageChoice) };
    return { timezone: optionalText(timezone) };
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = buildPayload();
    if (!payload) return;

    setBusy(true);
    try {
      const updated = await api.updateProfile(payload);
      setUser(updated);
      if (field === "language") setLanguage(resolveSupportedLanguage(updated.locale));
      go("profile");
    } catch (err) {
      setError(apiErrorMessage(err, t("profile.updateFailed")));
    } finally {
      setBusy(false);
    }
  }

  // The label is shown only where it adds something the page title does not already say.
  const detailByField: Record<Exclude<ProfileEditField, "email">, { label?: string; description: string }> = {
    name: {
      label: t("profile.edit.accountName"),
      description: t("profile.edit.accountNameBody", { product: PRODUCT_NAME })
    },
    gender: { description: t("profile.edit.genderBody") },
    phone: {
      label: user.phone_number ? (user.phone_verified ? t("profile.edit.phoneVerified") : t("profile.edit.phoneNotVerified")) : undefined,
      description: t("profile.edit.phoneBody")
    },
    birthday: { description: t("profile.edit.birthdayBody") },
    language: { description: t("profile.edit.languageBody") },
    timezone: { description: t("profile.edit.timezoneBody") }
  };
  const editDetail = detailByField[field];

  return (
    <form className="profile-edit-card" onSubmit={saveProfile}>
      <div className="profile-edit-card-copy">
        {editDetail.label && <span>{editDetail.label}</span>}
        <p>{editDetail.description}</p>
      </div>
      <div className="profile-edit-fields">
        {field === "name" && (
          <div className="profile-name-grid">
            <div className="profile-name-full">
              <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} autoComplete="nickname" required />
            </div>
            <Field label={t("profile.firstName")} value={firstName} onChange={setFirstName} autoComplete="given-name" />
            <Field label={t("profile.lastName")} value={lastName} onChange={setLastName} autoComplete="family-name" />
          </div>
        )}
        {field === "gender" && (
          <>
            <SelectField<GenderValue>
              label={t("common.gender")}
              value={gender}
              onChange={setGender}
              options={GENDER_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              placeholder={t("common.notSet")}
            />
            {gender === "custom" && <Field label={t("onboarding.customGender")} value={genderCustom} onChange={setGenderCustom} />}
          </>
        )}
        {field === "phone" && (
          <PhoneField
            label={t("onboarding.phoneLabel")}
            dialCode={dialCode}
            number={phoneNumber}
            onDialCodeChange={setDialCode}
            onNumberChange={setPhoneNumber}
          />
        )}
        {field === "birthday" && (
          <label className="field">
            <span>{t("profile.dateOfBirth")}</span>
            <input type="date" value={dateOfBirth} min="1900-01-01" max={todayIsoDate()} onChange={(event) => setDateOfBirth(event.target.value)} />
          </label>
        )}
        {field === "language" && (
          <SelectField<SupportedLanguage>
            label={t("common.language")}
            value={languageChoice}
            onChange={(value) => setLanguageChoice(value || "en")}
            options={LANGUAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder={null}
          />
        )}
        {field === "timezone" && (
          <>
            <SelectField<string>
              label={t("common.timezone")}
              value={timezone}
              onChange={setTimezone}
              options={timeZoneOptions}
              placeholder={t("common.notSet")}
            />
            {detectedTimeZone && detectedTimeZone !== timezone && (
              <button type="button" className="secondary field-action" onClick={() => setTimezone(detectedTimeZone)}>
                {t("profile.useBrowserTimezone", { zone: detectedTimeZone.replace(/_/g, " ") })}
              </button>
            )}
            {currentTime && <div className="field-help">{t("profile.currentTime", { time: currentTime })}</div>}
          </>
        )}
      </div>
      <Alert message={error} />
      <div className="button-row profile-edit-actions">
        <button className="primary" disabled={busy} aria-busy={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="secondary" onClick={() => go("profile")} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// ###############################################
// Security Screen
// ###############################################

const ACTIVITY_PAGE_SIZE = 5;

function securityEventIcon(eventType: string): SettingIconName {
  if (eventType.startsWith("login")) return "user";
  if (eventType.startsWith("password")) return "key";
  if (eventType.startsWith("mfa")) return "shield";
  if (eventType.startsWith("backup")) return "lifebuoy";
  if (eventType.startsWith("app_")) return "apps";
  if (eventType.startsWith("data_")) return "download";
  if (eventType.startsWith("recovery") || eventType.startsWith("email")) return "mail";
  if (eventType.startsWith("session") || eventType === "logout") return "devices";
  if (eventType.startsWith("profile") || eventType.startsWith("avatar") || eventType.startsWith("onboarding")) return "id";
  return "activity";
}

function isAlarmingEvent(eventType: string) {
  return /fail|denied|blocked|locked/.test(eventType);
}

function ActivityPanel({ events, loading, error }: { events: SecurityEvent[]; loading: boolean; error: string | null }) {
  const { t, locale, formatDateTime: formatFullDateTime } = useI18n();
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const hiddenCount = Math.max(events.length - visibleCount, 0);

  if (loading) return <Alert message={t("security.loadingActivityInline")} tone="info" />;
  if (error) return <Alert message={error} />;
  if (events.length === 0) return <div className="empty-inline">{t("security.noActivity")}</div>;

  return (
    <>
      <ul className="activity-list">
        {events.slice(0, visibleCount).map((event) => (
          <li key={event.id} className={`activity-item${isAlarmingEvent(event.event_type) ? " danger" : ""}`}>
            <span className="activity-icon">
              <SettingIcon name={securityEventIcon(event.event_type)} />
            </span>
            <span className="activity-copy">
              <strong>{securityEventTitle(event, t)}</strong>
              <span>
                {[deviceName(event.user_agent, event.device_label, t("security.unknownDevice")), event.ip_address].filter(Boolean).join(" · ")}
              </span>
            </span>
            <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
              {formatDayTime(event.created_at, locale)}
            </time>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="list-more" onClick={() => setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE * 2)}>
          {t("security.showMore", { count: hiddenCount })}
        </button>
      )}
    </>
  );
}

function SessionsPanel({
  sessions,
  loading,
  error,
  onChanged
}: {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingOthers, setConfirmingOthers] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const otherCount = sessions.filter((session) => !session.is_current).length;

  async function revokeSession(session: SessionInfo) {
    setPendingAction(session.id);
    setActionError(null);
    setMessage(null);
    try {
      await api.revokeSession(session.id);
      setMessage(t("security.sessionSignedOut"));
      await onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, t("security.signOutSessionFailed")));
    } finally {
      setPendingAction(null);
    }
  }

  async function signOutOthers() {
    setPendingAction("others");
    setActionError(null);
    setMessage(null);
    try {
      await api.logoutOtherSessions();
      setMessage(t("security.otherDevicesSignedOut"));
      setConfirmingOthers(false);
      await onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, t("security.signOutOthersFailed")));
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) return <Alert message={t("security.sessionsLoading")} tone="info" />;
  if (error) return <Alert message={error} />;
  if (sessions.length === 0) return <div className="empty-inline">{t("security.noSessions")}</div>;

  return (
    <div className="form-stack">
      <ul className="activity-list">
        {sessions.map((session) => {
          const device = describeUserAgent(session.user_agent);
          const address = session.last_seen_ip_address ?? session.login_ip_address;
          return (
            <li key={session.id} className="activity-item">
              <span className="activity-icon">
                <SettingIcon name={device.kind === "mobile" ? "phone" : "devices"} />
              </span>
              <span className="activity-copy">
                <strong>
                  {deviceName(session.user_agent, session.device_label, t("security.unknownDevice"))}
                  {session.is_current && <span className="current-badge">{t("security.currentDevice")}</span>}
                </strong>
                <span>
                  {[t("security.activeAgo", { time: formatRelativeTime(session.last_seen_at, locale) }), address].filter(Boolean).join(" · ")}
                </span>
              </span>
              {!session.is_current && (
                <button type="button" className="secondary" onClick={() => revokeSession(session)} disabled={pendingAction !== null}>
                  {pendingAction === session.id ? t("security.signingOut") : t("common.signOut")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Alert message={actionError} />
      <Alert message={message} tone="success" />
      {otherCount > 0 && (
        confirmingOthers ? (
          <div className="confirm-row">
            <span>
              <strong>{t("security.signOutOthersConfirm", { count: otherCount })}</strong>
              <small>{t("security.signOutOthersBody")}</small>
            </span>
            <div className="button-row">
              <button type="button" className="secondary danger" onClick={signOutOthers} disabled={pendingAction !== null}>
                {pendingAction === "others" ? t("security.signingOut") : t("security.confirmSignOut")}
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmingOthers(false)} disabled={pendingAction !== null}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirmingOthers(true)} disabled={pendingAction !== null}>
            {t("security.signOutOtherDevices")}
          </button>
        )
      )}
    </div>
  );
}

function VerificationPanel({
  user,
  setUser,
  onChanged
}: {
  user: User;
  setUser: (user: User) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setSetup(await api.startMfaSetup());
    } catch (err) {
      setError(apiErrorMessage(err, t("security.mfaStartFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setUser(await api.disableMfa({ current_password: password, code }));
      setPassword("");
      setCode("");
      setMessage(t("security.mfaDisabled"));
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("security.mfaDisableFailed")));
    } finally {
      setBusy(false);
    }
  }

  const finishSetup = (updated: User) => {
    setUser(updated);
    setSetup(null);
    setMessage(t("security.mfaEnabled"));
    onChanged();
  };

  if (setup) return <MfaSetupPanel setup={setup} onAuthenticated={finishSetup} onCancel={() => setSetup(null)} />;

  if (user.mfa_enabled) {
    return (
      <form className="form-stack" onSubmit={turnOff}>
        <Alert message={message} tone="success" />
        <p className="panel-note">{t("security.mfaOnBody")}</p>
        <Field label={t("common.currentPassword")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
        <CodeField label={t("common.verificationCode")} value={code} onChange={setCode} />
        <Alert message={error} />
        <button className="secondary danger" disabled={busy}>
          {t("security.turnOffMfa")}
        </button>
      </form>
    );
  }

  return (
    <div className="form-stack">
      <Alert message={message} tone="success" />
      <p className="panel-note">{t("security.mfaOffBody")}</p>
      <Alert message={error} />
      <button type="button" className="primary" onClick={startSetup} disabled={busy} aria-busy={busy}>
        {t("security.turnOnMfa")}
      </button>
    </div>
  );
}

function PasswordPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const longEnough = newPassword.length >= PASSWORD_MIN_LENGTH;
  const differsFromCurrent = newPassword !== "" && newPassword !== currentPassword;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!longEnough) {
      setError(t("password.tooShort", { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (!differsFromCurrent) {
      setError(t("password.sameAsCurrent"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("reset.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(t("security.passwordChanged"));
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("security.passwordChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={changePassword}>
      <Field label={t("common.currentPassword")} type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required />
      <Field label={t("common.newPassword")} type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" required />
      <PasswordRules
        rules={[
          { met: longEnough, label: t("password.ruleLength", { count: PASSWORD_MIN_LENGTH }) },
          { met: differsFromCurrent, label: t("password.ruleDifferent") }
        ]}
      />
      <Field label={t("password.confirmNew")} type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" required />
      <Alert message={error} />
      <Alert message={message} tone="success" />
      <button className="primary" disabled={busy} aria-busy={busy}>
        {t("security.changePassword")}
      </button>
    </form>
  );
}

function BackupCodesPanel({
  user,
  setUser,
  onChanged
}: {
  user: User;
  setUser: (user: User) => void;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [password, setPassword] = useState("");
  // Held only while this panel is open: the server cannot show the codes again.
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasCodes = user.backup_codes_remaining > 0;

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createBackupCodes(password);
      setCodes(result.codes);
      setPassword("");
      setUser(await api.me());
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("backup.generateFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("mfa.copyFailed"));
    }
  }

  function downloadCodes() {
    if (!codes) return;
    const url = URL.createObjectURL(new Blob([`${PRODUCT_NAME} · ${user.email}\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "gozilasim-id-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!user.mfa_enabled) return <p className="panel-note">{t("backup.needsVerification")}</p>;

  if (codes) {
    return (
      <div className="form-stack">
        <Alert message={t("backup.savedNotice")} tone="info" />
        <ol className="backup-code-grid">
          {codes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ol>
        <Alert message={error} />
        <div className="button-row">
          <button type="button" className="secondary" onClick={copyCodes}>
            {copied ? t("backup.copied") : t("backup.copy")}
          </button>
          <button type="button" className="secondary" onClick={downloadCodes}>
            {t("backup.download")}
          </button>
        </div>
        <button type="button" className="primary" onClick={() => setCodes(null)}>
          {t("backup.done")}
        </button>
      </div>
    );
  }

  const generatedOn = user.backup_codes_generated_at
    ? new Date(user.backup_codes_generated_at).toLocaleDateString(locale, { dateStyle: "medium" })
    : "";

  return (
    <form className="form-stack" onSubmit={generate}>
      <p className="panel-note">{t("backup.body")}</p>
      <p className="panel-status">
        {hasCodes ? t("backup.remaining", { count: user.backup_codes_remaining, date: generatedOn }) : t("backup.none")}
      </p>
      <Field label={t("common.currentPassword")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
      {hasCodes && <p className="panel-note">{t("backup.replaceWarning")}</p>}
      <Alert message={error} />
      <button className="primary" disabled={busy} aria-busy={busy}>
        {hasCodes ? t("backup.regenerate") : t("backup.generate")}
      </button>
    </form>
  );
}

function RecoveryEmailPanel({
  user,
  setUser,
  onChanged
}: {
  user: User;
  setUser: (user: User) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set while a code has been sent to this address and is waiting to be confirmed.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const sent = await api.startRecoveryEmail({ email, current_password: password });
      setDevCode(sent.dev_code ?? null);
      setPendingEmail(email.trim());
      setPassword("");
      setCode("");
    }, t("code.sendFailed"));
  }

  function confirmCode(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      setUser(await api.verifyRecoveryEmail(code));
      setPendingEmail(null);
      setEmail("");
      setDevCode(null);
      setMessage(t("recoveryEmail.added"));
      onChanged();
    }, t("code.verifyFailed"));
  }

  function removeEmail(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      setUser(await api.removeRecoveryEmail(password));
      setPassword("");
      setMessage(t("recoveryEmail.removed"));
      onChanged();
    }, t("recoveryEmail.removeFailed"));
  }

  if (user.recovery_email) {
    return (
      <form className="form-stack" onSubmit={removeEmail}>
        <Alert message={message} tone="success" />
        <p className="panel-note">{t("recoveryEmail.current", { email: user.recovery_email })}</p>
        <Field label={t("common.currentPassword")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
        <Alert message={error} />
        <button className="secondary danger" disabled={busy}>
          {t("recoveryEmail.remove")}
        </button>
      </form>
    );
  }

  if (pendingEmail) {
    return (
      <form className="form-stack" onSubmit={confirmCode}>
        <p className="panel-note">{t("code.sentTo", { email: pendingEmail })}</p>
        <DevCodeNote code={devCode} />
        <CodeField label={t("common.verificationCode")} value={code} onChange={setCode} />
        <Alert message={error} />
        <div className="button-row">
          <button className="primary" disabled={busy} aria-busy={busy}>
            {t("code.verify")}
          </button>
          <button type="button" className="secondary" onClick={() => { setPendingEmail(null); setError(null); }} disabled={busy}>
            {t("recoveryEmail.different")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="form-stack" onSubmit={sendCode}>
      <Alert message={message} tone="success" />
      <p className="panel-note">{t("recoveryEmail.body")}</p>
      <Field label={t("recoveryEmail.address")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <Field label={t("common.currentPassword")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
      <Alert message={error} />
      <button className="primary" disabled={busy} aria-busy={busy}>
        {t("recoveryEmail.send")}
      </button>
    </form>
  );
}

function SecurityPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const { t, locale } = useI18n();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<SecuritySection | null>(() => securitySectionFromUrl());
  const activityRow = useRef<HTMLButtonElement>(null);
  const verificationRow = useRef<HTMLButtonElement>(null);
  const passwordRow = useRef<HTMLButtonElement>(null);
  const backupCodesRow = useRef<HTMLButtonElement>(null);
  const recoveryEmailRow = useRef<HTMLButtonElement>(null);
  const sessionsRow = useRef<HTMLButtonElement>(null);
  const rowBySection: Record<SecuritySection, RefObject<HTMLButtonElement>> = {
    activity: activityRow,
    verification: verificationRow,
    password: passwordRow,
    "backup-codes": backupCodesRow,
    "recovery-email": recoveryEmailRow,
    sessions: sessionsRow
  };

  const refreshSecurityData = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextSessions, nextEvents] = await Promise.all([api.listSessions(), api.listSecurityEvents()]);
      setSessions(nextSessions);
      setEvents(nextEvents);
    } catch (err) {
      setLoadError(apiErrorMessage(err, t("security.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshSecurityData();
  }, [refreshSecurityData]);

  // Connected apps only feed the checkup, so a failure here leaves that one line unchecked.
  useEffect(() => {
    let active = true;
    api.listConnectedApps()
      .then((loaded) => {
        if (active) setApps(loaded);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function syncSectionFromUrl() {
      setExpandedSection(securitySectionFromUrl());
    }

    window.addEventListener("popstate", syncSectionFromUrl);
    return () => window.removeEventListener("popstate", syncSectionFromUrl);
  }, []);

  // Bring the opened row to the top so its panel is never left below the fold or behind the bottom bar.
  const revealSection = (section: SecuritySection) => {
    const scroll = () => {
      rowBySection[section].current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    };
    // The second pass runs after the panel has finished opening; only then is the page tall enough to scroll that far.
    const timers = [window.setTimeout(scroll, 60), window.setTimeout(scroll, 340)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  };

  useEffect(() => {
    if (!expandedSection) return;
    return revealSection(expandedSection);
  }, [expandedSection]);

  const toggleSection = (section: SecuritySection) => setExpandedSection((current) => current === section ? null : section);
  const openSection = (section: SecuritySection) => {
    // Already open means the effect above will not run again, so scroll to it directly.
    if (expandedSection === section) revealSection(section);
    else goSecuritySection(section);
  };
  const loaded = !loading && !loadError;
  const checkupItems = buildSecurityCheckup(
    user,
    { sessions: loaded ? sessions : null, events: loaded ? events : null, apps },
    t,
    locale,
    openSection
  );
  const latestEvent = events[0];
  const latestActivity = loading
    ? t("security.loadingActivity")
    : latestEvent
      ? `${securityEventTitle(latestEvent, t)} · ${formatDayTime(latestEvent.created_at, locale)}`
      : t("security.noRecentActivity");
  const sessionSummary = loading
    ? t("security.sessionsLoading")
    : t("security.sessionsCount", { count: sessions.length, label: sessions.length === 1 ? t("security.session") : t("security.sessions") });

  return (
    <SettingsPage title={t("security.title")}>
      <SecurityCheckup items={checkupItems} />

      <div className="settings-section">
        <h2>{t("security.recentActivity")}</h2>
        <p>{latestActivity}</p>
        <div className="settings-group">
          <SettingsRow
            icon="activity"
            title={t("account.activityTitle")}
            value={events.length === 0 ? t("security.noRecentActivity") : t("security.eventsCount", { count: events.length })}
            onClick={() => toggleSection("activity")}
            expanded={expandedSection === "activity"}
            controls="security-panel-activity"
            rowRef={activityRow}
          />
          <MotionPanel open={expandedSection === "activity"} id="security-panel-activity">
            <ActivityPanel events={events} loading={loading} error={loadError} />
          </MotionPanel>
        </div>
      </div>

      <div className="settings-section">
        <h2>{t("security.howSignIn")}</h2>
        <p>{t("security.howSignInBody")}</p>
        <div className="settings-group">
          <SettingsRow
            icon="shield"
            title={t("common.extraVerification")}
            value={user.mfa_enabled ? t("security.on") : t("security.off")}
            onClick={() => toggleSection("verification")}
            expanded={expandedSection === "verification"}
            controls="security-panel-verification"
            rowRef={verificationRow}
          />
          <MotionPanel open={expandedSection === "verification"} id="security-panel-verification">
            <VerificationPanel user={user} setUser={setUser} onChanged={() => void refreshSecurityData()} />
          </MotionPanel>

          <SettingsRow
            icon="key"
            title={t("common.password")}
            value={
              user.password_changed_at
                ? t("security.passwordLastChanged", { date: new Date(user.password_changed_at).toLocaleDateString(locale, { dateStyle: "medium" }) })
                : t("account.passwordDesc")
            }
            onClick={() => toggleSection("password")}
            expanded={expandedSection === "password"}
            controls="security-panel-password"
            rowRef={passwordRow}
          />
          <MotionPanel open={expandedSection === "password"} id="security-panel-password">
            <PasswordPanel
              onChanged={() => {
                void refreshSecurityData();
                // The account now carries a new "last changed" time.
                void api.me().then(setUser).catch(() => undefined);
              }}
            />
          </MotionPanel>

          <SettingsRow
            icon="lifebuoy"
            title={t("backup.title")}
            value={
              !user.mfa_enabled
                ? t("backup.rowNeedsVerification")
                : user.backup_codes_remaining > 0
                  ? t("backup.rowRemaining", { count: user.backup_codes_remaining })
                  : t("backup.rowNone")
            }
            onClick={() => toggleSection("backup-codes")}
            expanded={expandedSection === "backup-codes"}
            controls="security-panel-backup-codes"
            rowRef={backupCodesRow}
          />
          <MotionPanel open={expandedSection === "backup-codes"} id="security-panel-backup-codes">
            <BackupCodesPanel user={user} setUser={setUser} onChanged={() => void refreshSecurityData()} />
          </MotionPanel>

          <SettingsRow
            icon="mail"
            title={t("recoveryEmail.title")}
            value={user.recovery_email ?? t("common.notSet")}
            onClick={() => toggleSection("recovery-email")}
            expanded={expandedSection === "recovery-email"}
            controls="security-panel-recovery-email"
            rowRef={recoveryEmailRow}
          />
          <MotionPanel open={expandedSection === "recovery-email"} id="security-panel-recovery-email">
            <RecoveryEmailPanel user={user} setUser={setUser} onChanged={() => void refreshSecurityData()} />
          </MotionPanel>

          <SettingsRow
            icon="devices"
            title={t("common.activeSessions")}
            value={sessionSummary}
            onClick={() => toggleSection("sessions")}
            expanded={expandedSection === "sessions"}
            controls="security-panel-sessions"
            rowRef={sessionsRow}
          />
          <MotionPanel open={expandedSection === "sessions"} id="security-panel-sessions">
            <SessionsPanel sessions={sessions} loading={loading} error={loadError} onChanged={refreshSecurityData} />
          </MotionPanel>
        </div>
      </div>
    </SettingsPage>
  );
}

// ###############################################
// Connected Apps Screen
// ###############################################

const APP_SCOPE_NAMES: Record<string, TranslationKey> = {
  openid: "apps.scopeIdentity",
  email: "apps.scopeEmail",
  profile: "apps.scopeProfile",
  phone: "apps.scopePhone"
};

function connectedAppFromUrl() {
  return new URLSearchParams(window.location.search).get("app");
}

// A short list for the row, such as "Email, Profile". Signing in is implied unless it is the only thing shared.
function appScopeSummary(scopes: string[], t: I18nContextValue["t"]) {
  const shared = scopes.length > 1 ? scopes.filter((scope) => scope !== "openid") : scopes;
  return shared
    .map((scope) => (APP_SCOPE_NAMES[scope] ? t(APP_SCOPE_NAMES[scope]) : humanize(scope)))
    .join(t("common.listSeparator"));
}

function appLastUsed(app: ConnectedApp, t: I18nContextValue["t"], locale: string) {
  return app.last_used_at ? t("apps.lastUsed", { when: formatRelativeTime(app.last_used_at, locale) }) : t("apps.neverUsed");
}

function ConnectedAppsPage() {
  const { t, locale } = useI18n();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openApp, setOpenApp] = useState<string | null>(connectedAppFromUrl);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setLoadError(null);
    try {
      setApps(await api.listConnectedApps());
    } catch (err) {
      setLoadError(apiErrorMessage(err, t("apps.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  function toggleApp(clientId: string) {
    setOpenApp((current) => (current === clientId ? null : clientId));
    setConfirming(null);
    setActionError(null);
  }

  async function removeAccess(app: ConnectedApp) {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await api.removeConnectedApp(app.client_id);
      setApps((current) => current?.filter((item) => item.client_id !== app.client_id) ?? current);
      setOpenApp(null);
      setConfirming(null);
      setMessage(t("apps.removed", { app: app.name }));
    } catch (err) {
      setActionError(apiErrorMessage(err, t("apps.removeFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage title={t("apps.title")}>
      <div className="settings-section">
        <p>{t("apps.body", { product: PRODUCT_NAME })}</p>
        <Alert message={message} tone="success" />
        {loadError && (
          <div className="form-stack">
            <Alert message={loadError} />
            <button type="button" className="secondary" onClick={() => void loadApps()}>
              {t("common.retry")}
            </button>
          </div>
        )}
        {apps === null && !loadError && <Alert message={t("common.loading")} tone="info" />}
        {apps?.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">
              <SettingIcon name="apps" />
            </span>
            <strong>{t("apps.emptyTitle")}</strong>
            <span>{t("apps.emptyBody")}</span>
          </div>
        )}
        {apps && apps.length > 0 && (
          <div className="settings-group stacked-rows">
            {apps.map((app) => {
              const open = openApp === app.client_id;
              const panelId = `connected-app-${app.client_id}`;
              const appUrl = app.launch_url || app.home_url;
              return (
                <Fragment key={app.client_id}>
                  <button
                    type="button"
                    className="settings-row app-row"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggleApp(app.client_id)}
                  >
                    <span className="settings-row-icon app-row-icon">
                      <LauncherAppIcon app={app} />
                    </span>
                    <span className="settings-row-copy">
                      <strong>{app.name}</strong>
                      <span>{appScopeSummary(app.scopes, t)} · {appLastUsed(app, t, locale)}</span>
                    </span>
                    <span className="settings-row-right">
                      <ChevronIcon />
                    </span>
                  </button>
                  <MotionPanel open={open} id={panelId}>
                    <div className="form-stack">
                      <p className="panel-note">
                        {t("apps.grantedOn", { date: new Date(app.granted_at).toLocaleDateString(locale, { dateStyle: "long" }) })} · {appLastUsed(app, t, locale)}
                      </p>
                      <div className="oauth-scope-list">
                        <span>{t("apps.canSee")}</span>
                        <ul>
                          {app.scopes.map((scope) => (
                            <li key={scope}>
                              <SettingIcon name={oauthScopeIcon(scope)} />
                              {oauthScopeLabel(scope, t)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Alert message={actionError} />
                      {confirming === app.client_id ? (
                        <div className="confirm-row">
                          <span>
                            <strong>{t("apps.removeConfirm", { app: app.name })}</strong>
                            <small>{t("apps.removeBody")}</small>
                          </span>
                          <div className="button-row">
                            <button type="button" className="secondary danger" onClick={() => void removeAccess(app)} disabled={busy} aria-busy={busy}>
                              {busy ? t("apps.removing") : t("apps.removeButton")}
                            </button>
                            <button type="button" className="secondary" onClick={() => setConfirming(null)} disabled={busy}>
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="button-row">
                          {appUrl && (
                            <button type="button" className="secondary" onClick={() => { window.location.href = appUrl; }}>
                              {t("apps.open")}
                            </button>
                          )}
                          <button type="button" className="secondary danger" onClick={() => setConfirming(app.client_id)}>
                            {t("apps.removeButton")}
                          </button>
                        </div>
                      )}
                      <p className="panel-note">{t("apps.removeNote")}</p>
                    </div>
                  </MotionPanel>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </SettingsPage>
  );
}

// ###############################################
// Data And Privacy Screen
// ###############################################

function filledProfileFields(user: User) {
  const fields = [fullName(user), user.gender, user.phone_number, user.date_of_birth, user.locale, user.timezone];
  return { filled: fields.filter(Boolean).length, total: fields.length };
}

function downloadJsonFile(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function DeleteAccountDialog({
  user,
  confirmation,
  onClose
}: {
  user: User;
  confirmation: DeleteConfirmation;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const chrome = useChrome();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailMatches = email.trim().toLowerCase() === user.email.toLowerCase();
  // An authenticator code has 6 digits and a backup code 8. An emailed code is asked for first, then typed in.
  const codeReady = confirmation === "password"
    || (confirmation === "authenticator" && code.length >= VERIFICATION_CODE_LENGTH)
    || (confirmation === "email_code" && codeSent && code.length === VERIFICATION_CODE_LENGTH);
  const ready = emailMatches && password.length > 0 && codeReady;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.sendAccountDeletionCode();
      setDevCode(sent.dev_code ?? null);
      setCodeSent(true);
      setCode("");
      setResendIn(CODE_RESEND_SECONDS);
    } catch (err) {
      setError(apiErrorMessage(err, t("code.sendFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({
        email: email.trim(),
        current_password: password,
        code: confirmation === "password" ? undefined : code
      });
      chrome.accountDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, t("data.deleteFailed")));
      setBusy(false);
    }
  }

  return (
    <form className="delete-account-dialog" onSubmit={submit}>
      <div className="dialog-header">
        <h2>{t("data.deleteDialogTitle")}</h2>
        <button type="button" className="dialog-icon-button" aria-label={t("common.close")} onClick={onClose} disabled={busy}>
          <CloseIcon />
        </button>
      </div>
      <p className="dialog-hint">{t("data.deleteWarning")}</p>
      <ul className="delete-list">
        <li>{t("data.deleteItemProfile")}</li>
        <li>{t("data.deleteItemSessions")}</li>
        <li>{t("data.deleteItemApps")}</li>
      </ul>
      <p className="dialog-hint">{t("data.deleteAppsNote")}</p>
      <div className="form-stack">
        <Field
          label={t("data.deleteEmailLabel")}
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="off"
          error={email.trim() !== "" && !emailMatches ? t("data.deleteEmailMismatch") : null}
          required
        />
        <Field label={t("common.currentPassword")} type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
        {confirmation === "authenticator" && (
          <CodeField
            label={t("reset.codeOrBackup")}
            value={code}
            onChange={setCode}
            length={BACKUP_CODE_LENGTH}
            minLength={VERIFICATION_CODE_LENGTH}
          />
        )}
        {confirmation === "email_code" && (
          codeSent ? (
            <>
              <p className="panel-note">{t("code.sentTo", { email: user.email })}</p>
              <DevCodeNote code={devCode} />
              <CodeField label={t("common.verificationCode")} value={code} onChange={setCode} />
              <button type="button" className="link-button" onClick={() => void sendCode()} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? t("code.resendIn", { seconds: resendIn }) : t("code.resend")}
              </button>
            </>
          ) : (
            <button type="button" className="secondary" onClick={() => void sendCode()} disabled={busy}>
              {t("data.deleteSendCode")}
            </button>
          )
        )}
        <Alert message={error} />
        <div className="button-row">
          <button className="danger-solid" disabled={!ready || busy} aria-busy={busy}>
            {busy ? t("data.deleting") : t("data.deleteConfirm")}
          </button>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}

function DataPrivacyPage({ user }: { user: User }) {
  const { t } = useI18n();
  const chrome = useChrome();
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const profile = filledProfileFields(user);

  const loadSummary = useCallback(async () => {
    try {
      const loaded = await api.dataSummary();
      setSummary(loaded);
      return loaded;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function downloadData() {
    if (exportState === "busy") return;
    setExportState("busy");
    setError(null);
    try {
      downloadJsonFile(await api.exportAccountData(), `gozilasim-id-data-${todayIsoDate()}.json`);
      setExportState("done");
      // The download is recorded as security activity, so the count moves on by one.
      void loadSummary();
    } catch (err) {
      setError(apiErrorMessage(err, t("data.downloadFailed")));
      setExportState("idle");
    }
  }

  // The dialog needs to know which confirmation the server expects, so it opens only once that is known.
  async function openDeleteDialog() {
    setError(null);
    if (summary || await loadSummary()) {
      setDeleteOpen(true);
      return;
    }
    setError(t("data.deleteUnavailable"));
  }

  const appCount = summary?.connected_apps;
  const tiles: Array<{ label: string; value: string; run: () => void }> = [
    { label: t("data.tileProfile"), value: t("data.tileProfileValue", profile), run: () => go("profile") },
    {
      label: t("data.tileDevices"),
      value: summary ? t("data.tileDevicesValue", { count: summary.sessions }) : "—",
      run: () => goSecuritySection("sessions")
    },
    {
      label: t("data.tileActivity"),
      value: summary ? t("data.tileActivityValue", { count: summary.security_events }) : "—",
      run: () => goSecuritySection("activity")
    },
    {
      label: t("data.tilePictures"),
      value: summary ? t("data.tilePicturesValue", { count: summary.profile_pictures }) : "—",
      run: chrome.openPictureModal
    }
  ];

  return (
    <SettingsPage title={t("data.title")}>
      <div className="settings-section">
        <h2>{t("data.storedTitle")}</h2>
        <p>{t("data.storedBody")}</p>
        <div className="data-tiles">
          {tiles.map((tile) => (
            <button key={tile.label} type="button" className="data-tile" onClick={tile.run}>
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2>{t("data.manageTitle")}</h2>
        <div className="settings-group stacked-rows">
          <SettingsRow
            icon="download"
            title={t("data.downloadTitle")}
            value={exportState === "busy" ? t("data.downloading") : exportState === "done" ? t("data.downloaded") : t("data.downloadBody")}
            onClick={() => void downloadData()}
          />
          <SettingsRow
            icon="apps"
            title={t("apps.title")}
            value={
              appCount === undefined
                ? t("account.connectedAppsDesc")
                : appCount === 0
                  ? t("apps.countNone")
                  : t(appCount === 1 ? "apps.countOne" : "apps.countMany", { count: appCount })
            }
            onClick={() => go("connected-apps")}
          />
          <SettingsRow icon="file" title={t("data.privacyTitle")} value={t("data.privacyBody")} onClick={() => go("privacy")} />
        </div>
      </div>

      <div className="settings-section">
        <h2>{t("data.deleteSection")}</h2>
        <div className="settings-group stacked-rows danger-group">
          <SettingsRow icon="trash" title={t("data.deleteTitle")} value={t("data.deleteBody")} onClick={() => void openDeleteDialog()} />
        </div>
        <Alert message={error} />
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} label={t("data.deleteDialogTitle")} className="delete-account-modal">
        {summary && <DeleteAccountDialog user={user} confirmation={summary.delete_confirmation} onClose={() => setDeleteOpen(false)} />}
      </Modal>
    </SettingsPage>
  );
}

// ###############################################
// App Composition
// ###############################################

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  // Tracked so a query-only navigation (for example ?field=) re-renders the page it belongs to.
  const [search, setSearch] = useState(window.location.search);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings);
  const [loginBackgroundSrc, setLoginBackgroundSrc] = useState(loadLoginBackgroundSrc);
  const [language, setLanguageState] = useState<SupportedLanguage>(loadStoredLanguage);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const { user, setUser, loading } = useSession();

  useEffect(() => {
    const updateRoute = () => {
      setRoute(getRoute());
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  useEffect(() => {
    applyThemeSettings(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = localeForLanguage(language);
    saveStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    if (user?.locale) {
      setLanguageState(resolveSupportedLanguage(user.locale));
      return;
    }
    if (!user) {
      setLanguageState(loadStoredLanguage());
    }
  }, [user?.id, user?.locale]);

  // Someone who is already signed in has no use for the sign-in or register forms.
  useEffect(() => {
    if (loading || !user) return;
    if (route !== "login" && route !== "register") return;
    const redirect = nextUrl();
    if (redirect) {
      window.location.replace(redirect);
      return;
    }
    replaceRoute("account");
  }, [loading, route, user]);

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  const i18nValue = useMemo<I18nContextValue>(() => ({
    language,
    locale: localeForLanguage(language),
    setLanguage,
    t: (key, values) => translate(language, key, values),
    formatDateTime: (value) => formatDateTime(value, language)
  }), [language, setLanguage]);

  const updateTheme = useCallback((nextTheme: ThemeSettings) => {
    const normalized = normalizeTheme(nextTheme);
    setTheme(normalized);
    saveThemeSettings(normalized);
  }, []);

  const updateLoginBackground = useCallback((src: string) => {
    if (!isLoginBackgroundSrc(src)) return;
    setLoginBackgroundSrc(src);
    saveLoginBackgroundSrc(src);
  }, []);

  const finishOnboarding = useCallback(() => {
    if (pendingRedirect) {
      window.location.href = pendingRedirect;
      return;
    }
    go("account");
  }, [pendingRedirect]);

  // The session change is committed before the route change. A route update triggered from a history
  // event renders first otherwise, and for one frame the new page would see the previous session.
  const onAuthenticated = useCallback((nextUser: User) => {
    flushSync(() => setUser(nextUser));
    const redirect = nextUrl();
    setPendingRedirect(redirect);
    if (redirect) {
      window.location.href = redirect;
      return;
    }
    go("account");
  }, [setUser]);

  const onLogout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      flushSync(() => {
        setPictureModalOpen(false);
        setUser(null);
      });
      go("login");
    }
  }, [setUser]);

  // Used by the authorize screen: ends this session but stays on the request so another account can sign in.
  const switchAccount = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, [setUser]);

  const chromeValue = useMemo<ChromeContextValue>(() => ({
    setUser,
    openPictureModal: () => setPictureModalOpen(true),
    openAppearance: () => setAppearanceOpen(true),
    logout: () => void onLogout(),
    accountDeleted: () => {
      flushSync(() => {
        setPictureModalOpen(false);
        setUser(null);
      });
      goPath("/login?deleted=1");
    }
  }), [onLogout, setUser]);

  const closePictureModal = useCallback(() => setPictureModalOpen(false), []);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);

  // Every screen renders through here, so the picture and appearance dialogs exist exactly once.
  const withProviders = (content: ReactNode) => (
    <I18nContext.Provider value={i18nValue}>
      <ChromeContext.Provider value={chromeValue}>
        {content}
        {user && (
          <Modal open={pictureModalOpen} onClose={closePictureModal} label={i18nValue.t("avatar.change")} className="picture-modal">
            <ProfilePictureDialog user={user} setUser={setUser} onClose={closePictureModal} />
          </Modal>
        )}
        <Modal open={appearanceOpen} onClose={closeAppearance} label={i18nValue.t("theme.appearance")} className="appearance-modal">
          <AppearanceDialog
            theme={theme}
            onThemeChange={updateTheme}
            loginBackgroundSrc={loginBackgroundSrc}
            onLoginBackgroundChange={updateLoginBackground}
            onClose={closeAppearance}
          />
        </Modal>
      </ChromeContext.Provider>
    </I18nContext.Provider>
  );

  const protectedPage = useMemo(() => {
    if (route === "security" && user) return <SecurityPage user={user} setUser={setUser} />;
    if (route === "data-privacy" && user) return <DataPrivacyPage user={user} />;
    if (route === "connected-apps" && user) return <ConnectedAppsPage />;
    if (route === "profile" && user) return <ProfilePage user={user} />;
    if (route === "account" && user) return <AccountHomePage user={user} />;
    return null;
  }, [route, setUser, user]);

  const profileField = useMemo(() => profileEditField(), [search]);

  // Auth routes share one AuthLayout instance so the wallpaper video keeps playing between them.
  const withAuthLayout = (page: ReactNode) => withProviders(<AuthLayout backgroundSrc={loginBackgroundSrc}>{page}</AuthLayout>);

  if (isLegalRoute(route)) return withProviders(<LegalShell user={user} route={route} />);
  if ((route === "login" || route === "register") && user) {
    return withProviders(<StandaloneAccessState loading backgroundSrc={loginBackgroundSrc} />);
  }
  if (route === "register") return withAuthLayout(<RegisterPage onAuthenticated={onAuthenticated} />);
  if (route === "login") return withAuthLayout(<LoginPage onAuthenticated={onAuthenticated} />);
  if (route === "authorize") {
    return withProviders(
      <OAuthAuthorizePage
        user={user}
        loading={loading}
        onAuthenticated={onAuthenticated}
        onSwitchAccount={switchAccount}
        backgroundSrc={loginBackgroundSrc}
      />
    );
  }
  if (route === "forgot-password") return withAuthLayout(<ForgotPasswordPage />);
  if (route === "reset-password") return withAuthLayout(<ResetPasswordPage />);
  if (route === "profile-onboarding" && user) {
    return withAuthLayout(<ProfileOnboardingPage user={user} setUser={setUser} onFinished={finishOnboarding} />);
  }
  if (loading || !user) return withProviders(<StandaloneAccessState loading={loading} backgroundSrc={loginBackgroundSrc} />);
  if (route === "profile-edit") {
    return withProviders(
      <ProfileEditDetailShell user={user} title={profileEditTitle(profileField, i18nValue.t)}>
        <ProfileEditPage key={profileField} user={user} setUser={setUser} field={profileField} />
      </ProfileEditDetailShell>
    );
  }
  if (!protectedPage) return withProviders(<StandaloneAccessState loading={loading} backgroundSrc={loginBackgroundSrc} />);

  const activeConsoleRoute = route as ConsoleRoute;

  return withProviders(
    <Shell user={user} setUser={setUser} route={activeConsoleRoute}>
      {protectedPage}
    </Shell>
  );
}

