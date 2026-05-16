/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-17 02:58
Description: Main GozilaSim ID React UI for authentication, profile, launcher, legal, and sign-in protection screens.
*/

// ###############################################
// Imports
// ###############################################

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "./api";
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
import type {
  AuthorizeContext,
  AvatarHistoryItem,
  GenderValue,
  LauncherApp,
  LoginResponse,
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
const DEFAULT_LOGIN_BACKGROUND_SRC = "/backgrounds/26011-353916142_medium.mp4";
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

// ###############################################
// Routing Helpers
// ###############################################

type LegalRoute = "privacy" | "terms" | "help" | "about";
type Route = "login" | "register" | "forgot-password" | "reset-password" | "profile-onboarding" | "authorize" | "account" | "profile" | "profile-edit" | "security" | LegalRoute;
type ConsoleRoute = Extract<Route, "account" | "profile" | "security">;
type AuthenticatedHandler = (user: User) => void;
type ProfileEditField = "name" | "gender" | "phone" | "birthday" | "language" | "timezone" | "picture";
type SecuritySection = "activity" | "password" | "verification" | "sessions";
type ThemeField = "background" | "surface" | "surfaceMuted" | "text" | "mutedText" | "accent";
type ThemeSettings = Record<ThemeField, string>;

const CONSOLE_NAV: Array<{
  route: ConsoleRoute;
  label: string;
  icon: "home" | "profile" | "security";
  tone: "blue" | "green" | "cyan";
}> = [
  { route: "account", label: "Home", icon: "home", tone: "blue" },
  { route: "profile", label: "Personal info", icon: "profile", tone: "green" },
  { route: "security", label: "Security and sign-in", icon: "security", tone: "cyan" }
];

const LEGAL_ROUTES: LegalRoute[] = ["privacy", "terms", "help", "about"];
const LEGAL_NAV: Array<{ route: LegalRoute; label: string }> = [
  { route: "privacy", label: "Privacy" },
  { route: "terms", label: "Terms" },
  { route: "help", label: "Help" },
  { route: "about", label: "About" }
];

const LEGAL_CONTENT: Record<LegalRoute, {
  documentLabel: string;
  headline: string;
  body: string;
  toc: string[];
  highlights: Array<{ title: string; text: string }>;
}> = {
  privacy: {
    documentLabel: "GOZILASIM PRIVACY POLICY",
    headline: "When you use our services, you trust us with your information.",
    body: "This policy explains what we collect, why we collect it, and how you can manage your account data.",
    toc: [
      "Introduction",
      "Information GozilaSim collects",
      "Why GozilaSim collects data",
      "Your privacy controls",
      "Sharing your information",
      "Keeping your information secure",
      "Exporting & deleting your information",
      "Retaining your information",
      "About this policy"
    ],
    highlights: [
      { title: "Your privacy controls", text: "Review profile details, sessions, and sign-in protection from your account center." },
      { title: "Keeping your information secure", text: "Security settings and activity records help protect access to your account." },
      { title: "Exporting & deleting your information", text: "Account data should remain understandable and manageable from one place." }
    ]
  },
  terms: {
    documentLabel: "GOZILASIM TERMS OF SERVICE",
    headline: "These terms explain how GozilaSim ID works for your account.",
    body: "Use this page to understand account access, connected apps, responsibilities, and service limits.",
    toc: [
      "Introduction",
      "Using GozilaSim ID",
      "Connected applications",
      "Account responsibilities",
      "Security expectations",
      "Service availability",
      "Changes to these terms"
    ],
    highlights: [
      { title: "Using your account", text: "Your GozilaSim ID signs you into supported apps with one account experience." },
      { title: "Connected applications", text: "Apps may request access only to the scopes needed for their sign-in flow." },
      { title: "Account responsibilities", text: "Keep your password, recovery details, and active sessions current." }
    ]
  },
  help: {
    documentLabel: "GOZILASIM HELP",
    headline: "Find help for sign-in, profile, password, and connected app access.",
    body: "Common account actions are grouped here so you can recover access and manage your information faster.",
    toc: [
      "Get started",
      "Sign in problems",
      "Profile updates",
      "Password help",
      "Extra verification",
      "Connected apps",
      "Contact support"
    ],
    highlights: [
      { title: "Sign in problems", text: "Use password reset or extra verification prompts when your session needs another check." },
      { title: "Profile updates", text: "Manage your name, phone, birthday, language, timezone, and profile picture." },
      { title: "Connected apps", text: "Open supported apps from the app launcher when they are linked to your account." }
    ]
  },
  about: {
    documentLabel: "ABOUT GOZILASIM ID",
    headline: "GozilaSim ID is the account center for your profile and secure access.",
    body: "It brings profile details, sign-in protection, session review, and connected app access into one place.",
    toc: [
      "Overview",
      "Account center",
      "Profile management",
      "Security and sign-in",
      "App launcher",
      "Product principles"
    ],
    highlights: [
      { title: "Account center", text: "The account home gives you a single starting point for personal and security settings." },
      { title: "Security and sign-in", text: "Password, sessions, and extra verification controls are kept close to your profile." },
      { title: "App launcher", text: "The launcher provides quick access to apps connected to this identity system." }
    ]
  }
};

const PROFILE_EDIT_FIELDS: ProfileEditField[] = ["name", "gender", "phone", "birthday", "language", "timezone", "picture"];
const SECURITY_SECTIONS: SecuritySection[] = ["activity", "password", "verification", "sessions"];

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

// ###############################################
// Language Helpers
// ###############################################

type I18nContextValue = {
  language: SupportedLanguage;
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
    path === "account"
  ) return path;
  return "login";
}

function go(path: Route) {
  window.history.pushState({}, "", `/${path}`);
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

function nextUrl() {
  return new URLSearchParams(window.location.search).get("next");
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
    picture: t("common.profilePicture"),
    name: t("common.name"),
    gender: t("common.gender"),
    phone: t("common.phone"),
    birthday: t("common.birthday"),
    language: t("common.language"),
    timezone: t("common.timezone")
  };
  return titleByField[field];
}

function routeForSearch(value: string): ConsoleRoute {
  const target = value.trim().toLowerCase();
  if (!target) return "account";
  if (
    target.includes("password") ||
    target.includes("device") ||
    target.includes("session") ||
    target.includes("security") ||
    target.includes("verification") ||
    target.includes("activity")
  ) return "security";
  if (target.includes("home") || target.includes("account")) return "account";
  return "profile";
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
      scope
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
  return humanize(scope);
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

function metadataSummary(metadata: Record<string, unknown> | null, t: I18nContextValue["t"]) {
  if (!metadata || Object.keys(metadata).length === 0) return t("security.noExtraDetails");
  return Object.entries(metadata)
    .map(([key, value]) => t("format.metadata", { key: humanize(key), value: String(value) }))
    .join(", ");
}

function genderLabel(value: string | null, t: I18nContextValue["t"]) {
  if (!value) return t("common.notSet");
  const option = GENDER_OPTIONS.find((item) => item.value === value);
  return option ? t(option.labelKey) : humanize(value);
}

function fullName(user: User) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
}

function primaryLanguage(user: User, emptyLabel: string) {
  return labelForLocale(user.locale, emptyLabel);
}

function latestSecurityEvent(events: SecurityEvent[], t: I18nContextValue["t"], format: I18nContextValue["formatDateTime"]) {
  if (events.length === 0) return t("security.noRecentActivity");
  const event = events[0];
  return `${humanize(event.event_type)} · ${format(event.created_at)}`;
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
    return stored ? normalizeTheme(JSON.parse(stored)) : DEFAULT_THEME;
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
  return typeof value === "string" && LOGIN_BACKGROUND_OPTIONS.some((option) => option.src === value);
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

function accentContrast(hex: string) {
  return relativeLuminance(hex) > 0.52 ? "#172033" : "#ffffff";
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
}

// ###############################################
// Motion Helpers
// ###############################################

type MotionPresenceState = "closed" | "opening" | "open" | "closing";

const MOTION_FAST_MS = 160;
const MOTION_BASE_MS = 220;

function useMotionPresence(open: boolean, duration = MOTION_BASE_MS) {
  const [state, setState] = useState<MotionPresenceState>(() => open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setState("opening");
      const frame = window.requestAnimationFrame(() => setState("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    if (state === "closed") return;
    setState("closing");
    const timeout = window.setTimeout(() => setState("closed"), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, open]);

  return {
    mounted: state !== "closed",
    state
  };
}

function MotionPanel({ open, children }: { open: boolean; children: ReactNode }) {
  const presence = useMotionPresence(open);
  if (!presence.mounted) return null;

  return (
    <div className="settings-row-panel" data-state={presence.state}>
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
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        required={props.required}
      />
    </label>
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
  return <div className={`alert alert-${tone}`}>{message}</div>;
}

function LogoMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={logoMarkSrc} alt="" draggable="false" />
    </span>
  );
}

function AuthWallpaper({ videoSrc }: { videoSrc: string }) {
  return (
    <div className="auth-wallpaper" aria-hidden="true">
      {videoSrc && (
        <video key={videoSrc} className="auth-wallpaper-video" autoPlay muted loop playsInline>
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
      <div className="auth-wallpaper-gradient" />
      <div className="auth-wallpaper-grid" />
    </div>
  );
}

function ConsoleIcon({ icon }: { icon: "home" | "profile" | "security" }) {
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 19 4.1-1 9.4-9.4a2.1 2.1 0 0 0-3-3L6.1 15 5 19Z" />
      <path d="m14.7 6.3 3 3" />
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

function SettingIcon({ name }: { name: "camera" | "id" | "user" | "mail" | "phone" | "cake" | "globe" | "clock" | "check" | "activity" | "shield" | "key" | "devices" }) {
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

function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-page">
      <h1>{title}</h1>
      <div className="settings-column">{children}</div>
    </section>
  );
}

function SettingsRow(props: {
  icon: Parameters<typeof SettingIcon>[0]["name"];
  title: string;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
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
      <button className="settings-row" onClick={props.onClick}>
        {content}
      </button>
    );
  }
  return <div className="settings-row settings-row-static">{content}</div>;
}

function ProfilePictureModal({
  user,
  setUser,
  onClose
}: {
  user: User;
  setUser: (user: User) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"change" | "history">("change");
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<AvatarHistoryItem[]>(user.avatar_history ?? []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPresence = useMotionPresence(menuOpen, MOTION_FAST_MS);
  const selectedFileName = selectedFile?.name ?? t("avatar.noFile");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  useEffect(() => {
    function closeMenuOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeMenuOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeMenuOnOutsideClick);
  }, []);

  async function loadAvatarHistory() {
    setHistoryLoading(true);
    setError(null);
    try {
      setHistory(await api.listAvatarHistory());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("avatar.historyFailed"));
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistoryView() {
    setMenuOpen(false);
    setView("history");
    void loadAvatarHistory();
  }

  async function restorePicture(item: AvatarHistoryItem) {
    setBusy(true);
    setError(null);
    try {
      const updatedUser = await api.restoreAvatar(item.public_id);
      setUser(updatedUser);
      setHistory(updatedUser.avatar_history);
      setView("change");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("avatar.restoreFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePicture(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!selectedFile) {
        setError(t("avatar.chooseImage"));
        return;
      }
      setUser(await api.uploadAvatar(selectedFile));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("avatar.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const menu = (
    <div className="picture-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className={`picture-more-button ${menuOpen ? "active" : ""}`}
        aria-label={t("avatar.more")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        disabled={busy}
      >
        <MoreIcon />
      </button>
      {menuPresence.mounted && (
        <div className="picture-more-menu" role="menu" data-state={menuPresence.state}>
          <button type="button" role="menuitem" disabled>
            {t("avatar.visibility")}
          </button>
          <button type="button" role="menuitem" className={view === "history" ? "active" : ""} onClick={openHistoryView}>
            {t("avatar.history")}
          </button>
          <button type="button" role="menuitem" disabled>
            {t("common.birthday")}
          </button>
          <button type="button" role="menuitem" disabled>
            {t("avatar.remove")}
          </button>
          <button type="button" role="menuitem" disabled>
            {t("avatar.help")}
          </button>
          <button type="button" role="menuitem" disabled>
            {t("avatar.feedback")}
          </button>
        </div>
      )}
    </div>
  );

  if (view === "history") {
    return (
      <div className="picture-modal-card picture-history-card">
        <div className="picture-history-header">
          <button type="button" className="picture-back-button" aria-label={t("avatar.back")} onClick={() => setView("change")} disabled={busy}>
            <BackIcon />
          </button>
          <h1>{t("avatar.history")}</h1>
          {menu}
        </div>

        <div className="picture-history-grid" aria-busy={historyLoading}>
          {history.map((item) => (
            <button
              key={item.public_id}
              type="button"
              className="picture-history-item"
              aria-label={t("avatar.restore")}
              onClick={() => restorePicture(item)}
              disabled={busy || historyLoading}
            >
              <img src={item.url} alt="" />
            </button>
          ))}
        </div>

        <Alert message={error} />
      </div>
    );
  }

  return (
    <form className="picture-modal-card" onSubmit={savePicture}>
      <div className="picture-modal-header">
        <button type="button" className="picture-close-button" aria-label={t("avatar.close")} onClick={onClose} disabled={busy}>
          <CloseIcon />
        </button>
        <h1>{t("avatar.change")}</h1>
        {menu}
      </div>

      <div className="picture-avatar-stage">
        <Avatar user={user} />
        <span aria-hidden="true">
          <CameraIcon />
        </span>
      </div>

      <div className="picture-action-list">
        <label className="picture-action-row">
          <span className="picture-action-icon">
            <ImageIcon />
          </span>
          <span>
            <strong>{t("avatar.uploadFromDevice")}</strong>
            <small>{selectedFileName}</small>
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
        </label>
        <button type="button" className="picture-action-row" disabled>
          <span className="picture-action-icon">
            <CameraIcon />
          </span>
          <span>
            <strong>{t("avatar.takePicture")}</strong>
            <small>{t("avatar.cameraUnavailable")}</small>
          </span>
        </button>
      </div>

      <Alert message={error} />
      <div className="button-row picture-buttons">
        <button className="primary" disabled={busy || !selectedFile}>
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
// Onboarding Helpers
// ###############################################

async function skipAndCompleteOnboardingPrompt(field: ProfilePromptField) {
  await api.skipProfileOnboarding(field);
  return api.completeProfileOnboarding();
}

function Shell({
  user,
  setUser,
  route,
  children,
  onLogout
}: {
  user: User;
  setUser: (user: User) => void;
  route: ConsoleRoute;
  children: ReactNode;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const [topbarQuery, setTopbarQuery] = useState("");
  const [launcherApps, setLauncherApps] = useState<LauncherApp[]>([]);
  const [launcherLoaded, setLauncherLoaded] = useState(false);
  const [launcherLoading, setLauncherLoading] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const appsLauncherRef = useRef<HTMLDivElement>(null);
  const accountMenuPresence = useMotionPresence(accountMenuOpen, MOTION_FAST_MS);
  const appsLauncherPresence = useMotionPresence(appsLauncherOpen, MOTION_FAST_MS);
  const pictureModalPresence = useMotionPresence(pictureModalOpen, MOTION_BASE_MS);
  const hasOnboardingPrompt = Boolean(
    route === "account" && user.profile_completion.next_prompt_field && !user.profile_completion.onboarding_completed
  );
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(hasOnboardingPrompt);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const onboardingModalPresence = useMotionPresence(onboardingModalOpen, MOTION_BASE_MS);

  const loadLauncherApps = useCallback(async () => {
    setLauncherLoading(true);
    setLauncherError(null);
    try {
      setLauncherApps(await api.listLauncherApps());
    } catch (err) {
      setLauncherError(err instanceof ApiError ? err.message : t("account.appsLoadFailed"));
    } finally {
      setLauncherLoaded(true);
      setLauncherLoading(false);
    }
  }, [t]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setAppsLauncherOpen(false);
      }
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (appsLauncherRef.current && !appsLauncherRef.current.contains(target)) {
        setAppsLauncherOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (appsLauncherOpen && !launcherLoaded) {
      void loadLauncherApps();
    }
  }, [appsLauncherOpen, launcherLoaded, loadLauncherApps]);

  useEffect(() => {
    if (route !== "account" || !hasOnboardingPrompt) {
      setOnboardingModalOpen(false);
      setOnboardingDismissed(false);
      return;
    }
    if (!onboardingDismissed) setOnboardingModalOpen(true);
  }, [route, hasOnboardingPrompt, onboardingDismissed, user.id]);

  const navigateConsole = (nextRoute: ConsoleRoute) => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    go(nextRoute);
  };

  const navigateLegal = (nextRoute: LegalRoute) => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    go(nextRoute);
  };

  const openProfilePictureModal = () => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    setPictureModalOpen(true);
  };

  const dismissOnboardingModal = () => {
    setOnboardingDismissed(true);
    setOnboardingModalOpen(false);
  };

  const skipAndCloseOnboardingModal = async () => {
    const field = user.profile_completion.next_prompt_field;
    dismissOnboardingModal();
    if (!field || user.profile_completion.onboarding_completed) return;

    try {
      setUser(await skipAndCompleteOnboardingPrompt(field));
    } catch {
      // Dismissal should not trap the user if the best-effort persistence request fails.
    }
  };

  const openLauncherApp = (app: LauncherApp) => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    window.location.href = app.launch_url || app.home_url;
  };

  function submitTopbarSearch(event: FormEvent) {
    event.preventDefault();
    const nextRoute = routeForSearch(topbarQuery);
    setTopbarQuery("");
    navigateConsole(nextRoute);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigateConsole("account")}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>
        <nav className="sidebar-nav" aria-label={t("account.settings")}>
          {CONSOLE_NAV.map((item) => {
            const label = item.route === "account" ? t("nav.home") : item.route === "profile" ? t("nav.personalInfo") : t("nav.security");
            return (
              <button
                key={item.route}
                className={`nav-item ${route === item.route ? "active" : ""}`}
                onClick={() => navigateConsole(item.route)}
              >
                <span className={`nav-icon nav-icon-${item.tone}`}>
                  <ConsoleIcon icon={item.icon} />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <nav className="sidebar-footer-links" aria-label="Legal pages">
            {LEGAL_NAV.map((item) => (
              <button type="button" key={item.route} onClick={() => navigateLegal(item.route)}>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="console-shell">
        <header className="console-topbar">
          <button className="mobile-topbar-brand brand" onClick={() => navigateConsole("account")}>
            <LogoMark />
            <span>{PRODUCT_NAME}</span>
          </button>

          <form className="topbar-search" onSubmit={submitTopbarSearch}>
            <SearchIcon />
            <input
              value={topbarQuery}
              onChange={(event) => setTopbarQuery(event.target.value)}
              placeholder={t("account.search", { product: PRODUCT_NAME })}
              aria-label={t("account.search", { product: PRODUCT_NAME })}
            />
          </form>

          <div className="apps-menu" ref={appsLauncherRef}>
            <button
              className="icon-button"
              aria-label={t("account.openApps")}
              aria-expanded={appsLauncherOpen}
              onClick={() => {
                setAppsLauncherOpen((open) => !open);
                setAccountMenuOpen(false);
              }}
            >
              <GridIcon />
            </button>
            {appsLauncherPresence.mounted && (
              <div className="apps-popover" role="dialog" aria-label={t("account.appsLauncher")} data-state={appsLauncherPresence.state}>
                <div className="apps-launcher-panel">
                  <div className="apps-launcher-header">
                    <h2>{t("account.favourites")}</h2>
                    <button className="apps-edit-button" aria-label={t("account.editFavourites")} disabled>
                      <PencilIcon />
                    </button>
                  </div>
                  <div className="apps-launcher-body">
                    <div className="apps-grid">
                      <button className="launcher-app-tile" onClick={() => navigateConsole("account")}>
                        <span className="launcher-app-icon launcher-account-icon">
                          <Avatar user={user} />
                        </span>
                        <span className="launcher-app-name">{t("common.account")}</span>
                      </button>
                      {launcherApps.map((app) => (
                        <button
                          key={app.client_id}
                          className="launcher-app-tile"
                          onClick={() => openLauncherApp(app)}
                          title={app.name}
                        >
                          <LauncherAppIcon app={app} />
                          <span className="launcher-app-name">{app.name}</span>
                        </button>
                      ))}
                    </div>
                    {launcherLoading && <div className="launcher-inline-state">{t("account.appsLoading")}</div>}
                    {launcherError && <div className="launcher-inline-state launcher-inline-error">{launcherError}</div>}
                    {!launcherLoading && !launcherError && launcherLoaded && launcherApps.length === 0 && (
                      <div className="launcher-inline-state">{t("account.noConnectedApps")}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="avatar-button"
              aria-label={t("account.openAccountMenu")}
              aria-expanded={accountMenuOpen}
              onClick={() => {
                setAccountMenuOpen((open) => !open);
                setAppsLauncherOpen(false);
              }}
            >
              <Avatar user={user} />
            </button>
            {accountMenuPresence.mounted && (
              <div className="account-popover" role="menu" data-state={accountMenuPresence.state}>
                <button className="popover-close" aria-label={t("common.close")} onClick={() => setAccountMenuOpen(false)}>
                  <CloseIcon />
                </button>
                <div className="account-popover-email">{user.email}</div>
                <div className="account-popover-avatar">
                  <Avatar user={user} />
                  <button aria-label={t("avatar.change")} onClick={openProfilePictureModal}>
                    <CameraIcon />
                  </button>
                </div>
                <h2>{t("account.greeting", { name: user.display_name })}</h2>
                <button className="account-manage-button" onClick={() => navigateConsole("profile")}>
                  {t("account.manage", { product: PRODUCT_NAME })}
                </button>
                <div className="account-popover-actions">
                  <button onClick={onLogout}>{t("common.signOut")}</button>
                </div>
                <div className="account-popover-footer">{t("account.popoverFooter")}</div>
              </div>
            )}
          </div>
        </header>
        <main className="main">
          <div key={route} className="motion-page" data-state="open">
            {children}
          </div>
        </main>
      </div>
      {pictureModalPresence.mounted && (
        <div
          className="picture-modal-overlay"
          data-state={pictureModalPresence.state}
          role="dialog"
          aria-modal="true"
          aria-label={t("avatar.change")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPictureModalOpen(false);
          }}
        >
          <ProfilePictureModal user={user} setUser={setUser} onClose={() => setPictureModalOpen(false)} />
        </div>
      )}
      {onboardingModalPresence.mounted &&
        createPortal(
          <div
            className="onboarding-modal-overlay"
            data-state={onboardingModalPresence.state}
            role="dialog"
            aria-modal="true"
            aria-label={t("profile.title")}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) void skipAndCloseOnboardingModal();
            }}
          >
            <div className="onboarding-modal-card">
              <button type="button" className="popover-close onboarding-modal-close" aria-label={t("common.close")} onClick={() => void skipAndCloseOnboardingModal()}>
                <CloseIcon />
              </button>
              <ProfileOnboardingPanel user={user} setUser={setUser} onFinished={dismissOnboardingModal} completeOnSkip />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function ProfileEditDetailShell({
  user,
  setUser,
  title,
  children,
  onLogout
}: {
  user: User;
  setUser: (user: User) => void;
  title: string;
  children: ReactNode;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuPresence = useMotionPresence(accountMenuOpen, MOTION_FAST_MS);
  const pictureModalPresence = useMotionPresence(pictureModalOpen, MOTION_BASE_MS);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  const navigateConsole = (nextRoute: ConsoleRoute) => {
    setAccountMenuOpen(false);
    go(nextRoute);
  };

  const openProfilePictureModal = () => {
    setAccountMenuOpen(false);
    setPictureModalOpen(true);
  };

  return (
    <main className="profile-edit-shell">
      <header className="profile-edit-topbar">
        <button className="brand profile-edit-brand" onClick={() => navigateConsole("account")}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>
        <div className="account-menu" ref={accountMenuRef}>
          <button
            className="avatar-button"
            aria-label={t("account.openAccountMenu")}
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <Avatar user={user} />
          </button>
          {accountMenuPresence.mounted && (
            <div className="account-popover profile-edit-account-popover" role="menu" data-state={accountMenuPresence.state}>
              <button className="popover-close" aria-label={t("common.close")} onClick={() => setAccountMenuOpen(false)}>
                <CloseIcon />
              </button>
              <div className="account-popover-email">{user.email}</div>
              <div className="account-popover-avatar">
                <Avatar user={user} />
                <button aria-label={t("avatar.change")} onClick={openProfilePictureModal}>
                  <CameraIcon />
                </button>
              </div>
              <h2>{t("account.greeting", { name: user.display_name })}</h2>
              <button className="account-manage-button" onClick={() => navigateConsole("profile")}>
                {t("account.manage", { product: PRODUCT_NAME })}
              </button>
              <div className="account-popover-actions">
                <button onClick={onLogout}>{t("common.signOut")}</button>
              </div>
              <div className="account-popover-footer">{t("account.popoverFooter")}</div>
            </div>
          )}
        </div>
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
      {pictureModalPresence.mounted && (
        <div
          className="picture-modal-overlay"
          data-state={pictureModalPresence.state}
          role="dialog"
          aria-modal="true"
          aria-label={t("avatar.change")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPictureModalOpen(false);
          }}
        >
          <ProfilePictureModal user={user} setUser={setUser} onClose={() => setPictureModalOpen(false)} />
        </div>
      )}
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

function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className={`language-switcher ${className}`} aria-label={t("common.language")}>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.value}
          className={language === option.value ? "active" : ""}
          aria-pressed={language === option.value}
          onClick={() => setLanguage(option.value)}
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

function LauncherAppIcon({ app }: { app: LauncherApp }) {
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
  const content = LEGAL_CONTENT[route];

  return (
    <section className="legal-page">
      <header className="legal-document-header">
        <h1>GozilaSim Privacy &amp; Terms</h1>
        <nav className="legal-tabs" aria-label="Legal pages">
          {LEGAL_NAV.map((item) => (
            <button
              key={item.route}
              className={`legal-tab${item.route === route ? " legal-tab-active" : ""}`}
              aria-current={item.route === route ? "page" : undefined}
              onClick={() => go(item.route)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="legal-document-grid">
        <aside className="legal-toc" aria-label={`${content.documentLabel} sections`}>
          <nav>
            {content.toc.map((item, index) => (
              <a
                key={item}
                className={`legal-toc-link${index === 0 ? " legal-toc-link-active" : ""}`}
                href={`#legal-section-${route}-${index}`}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>

        <article className="legal-article">
          <LegalIllustration />
          <div className="legal-article-copy">
            <p className="legal-kicker">{content.documentLabel}</p>
            <h2 id={`legal-section-${route}-0`}>{content.headline}</h2>
            <p>{content.body}</p>
          </div>

          <div className="legal-highlight-list">
            {content.highlights.map((item, index) => (
              <section id={`legal-section-${route}-${index + 1}`} className="legal-highlight" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function LegalShell({
  user,
  setUser,
  route,
  onLogout
}: {
  user: User;
  setUser: (user: User) => void;
  route: LegalRoute;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const [launcherApps, setLauncherApps] = useState<LauncherApp[]>([]);
  const [launcherLoaded, setLauncherLoaded] = useState(false);
  const [launcherLoading, setLauncherLoading] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const appsLauncherRef = useRef<HTMLDivElement>(null);
  const accountMenuPresence = useMotionPresence(accountMenuOpen, MOTION_FAST_MS);
  const appsLauncherPresence = useMotionPresence(appsLauncherOpen, MOTION_FAST_MS);
  const pictureModalPresence = useMotionPresence(pictureModalOpen, MOTION_BASE_MS);

  const loadLauncherApps = useCallback(async () => {
    setLauncherLoading(true);
    setLauncherError(null);
    try {
      setLauncherApps(await api.listLauncherApps());
    } catch (err) {
      setLauncherError(err instanceof ApiError ? err.message : t("account.appsLoadFailed"));
    } finally {
      setLauncherLoaded(true);
      setLauncherLoading(false);
    }
  }, [t]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setAppsLauncherOpen(false);
      }
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (appsLauncherRef.current && !appsLauncherRef.current.contains(target)) {
        setAppsLauncherOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (appsLauncherOpen && !launcherLoaded) {
      void loadLauncherApps();
    }
  }, [appsLauncherOpen, launcherLoaded, loadLauncherApps]);

  const navigateAccount = () => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    go("account");
  };

  const navigateProfile = () => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    go("profile");
  };

  const openProfilePictureModal = () => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    setPictureModalOpen(true);
  };

  const openLauncherApp = (app: LauncherApp) => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    window.location.href = app.launch_url || app.home_url;
  };

  return (
    <main className="legal-shell">
      <header className="legal-topbar">
        <button className="brand legal-brand" onClick={navigateAccount}>
          <LogoMark />
          <span>{PRODUCT_NAME}</span>
        </button>

        <div className="legal-topbar-actions">
          <div className="apps-menu" ref={appsLauncherRef}>
            <button
              className="icon-button"
              aria-label={t("account.openApps")}
              aria-expanded={appsLauncherOpen}
              onClick={() => {
                setAppsLauncherOpen((open) => !open);
                setAccountMenuOpen(false);
              }}
            >
              <GridIcon />
            </button>
            {appsLauncherPresence.mounted && (
              <div className="apps-popover" role="dialog" aria-label={t("account.appsLauncher")} data-state={appsLauncherPresence.state}>
                <div className="apps-launcher-panel">
                  <div className="apps-launcher-header">
                    <h2>{t("account.favourites")}</h2>
                    <button className="apps-edit-button" aria-label={t("account.editFavourites")} disabled>
                      <PencilIcon />
                    </button>
                  </div>
                  <div className="apps-launcher-body">
                    <div className="apps-grid">
                      <button className="launcher-app-tile" onClick={navigateAccount}>
                        <span className="launcher-app-icon launcher-account-icon">
                          <Avatar user={user} />
                        </span>
                        <span className="launcher-app-name">{t("common.account")}</span>
                      </button>
                      {launcherApps.map((app) => (
                        <button
                          key={app.client_id}
                          className="launcher-app-tile"
                          onClick={() => openLauncherApp(app)}
                          title={app.name}
                        >
                          <LauncherAppIcon app={app} />
                          <span className="launcher-app-name">{app.name}</span>
                        </button>
                      ))}
                    </div>
                    {launcherLoading && <div className="launcher-inline-state">{t("account.appsLoading")}</div>}
                    {launcherError && <div className="launcher-inline-state launcher-inline-error">{launcherError}</div>}
                    {!launcherLoading && !launcherError && launcherLoaded && launcherApps.length === 0 && (
                      <div className="launcher-inline-state">{t("account.noConnectedApps")}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="avatar-button"
              aria-label={t("account.openAccountMenu")}
              aria-expanded={accountMenuOpen}
              onClick={() => {
                setAccountMenuOpen((open) => !open);
                setAppsLauncherOpen(false);
              }}
            >
              <Avatar user={user} />
            </button>
            {accountMenuPresence.mounted && (
              <div className="account-popover" role="menu" data-state={accountMenuPresence.state}>
                <button className="popover-close" aria-label={t("common.close")} onClick={() => setAccountMenuOpen(false)}>
                  <CloseIcon />
                </button>
                <div className="account-popover-email">{user.email}</div>
                <div className="account-popover-avatar">
                  <Avatar user={user} />
                  <button aria-label={t("avatar.change")} onClick={openProfilePictureModal}>
                    <CameraIcon />
                  </button>
                </div>
                <h2>{t("account.greeting", { name: user.display_name })}</h2>
                <button className="account-manage-button" onClick={navigateProfile}>
                  {t("account.manage", { product: PRODUCT_NAME })}
                </button>
                <div className="account-popover-actions">
                  <button onClick={onLogout}>{t("common.signOut")}</button>
                </div>
                <div className="account-popover-footer">{t("account.popoverFooter")}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <LegalDocumentPage route={route} />

      {pictureModalPresence.mounted && (
        <div
          className="picture-modal-overlay"
          data-state={pictureModalPresence.state}
          role="dialog"
          aria-modal="true"
          aria-label={t("avatar.change")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPictureModalOpen(false);
          }}
        >
          <ProfilePictureModal user={user} setUser={setUser} onClose={() => setPictureModalOpen(false)} />
        </div>
      )}
    </main>
  );
}

function AuthLayout({ children, backgroundSrc }: { children: ReactNode; backgroundSrc: string }) {
  const { t } = useI18n();
  return (
    <main className="auth-page">
      <AuthWallpaper videoSrc={backgroundSrc} />
      <header className="auth-header">
        <AuthBrand />
        <LanguageSwitcher className="auth-language-switcher" />
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
        <div className="panel auth-panel">{children}</div>
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

function BackgroundPickerModal({
  selectedSrc,
  onSelect,
  onReset,
  onClose,
  motionState
}: {
  selectedSrc: string;
  onSelect: (src: string) => void;
  onReset: () => void;
  onClose: () => void;
  motionState: MotionPresenceState;
}) {
  const { t } = useI18n();

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="background-picker-overlay"
      data-state={motionState}
      role="dialog"
      aria-modal="true"
      aria-label={t("theme.bgPickerTitle")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="background-picker-card">
        <header className="background-picker-header">
          <div>
            <h2>{t("theme.bgPickerTitle")}</h2>
            <p>{t("theme.savedLocal")}</p>
          </div>
          <button type="button" className="theme-close" aria-label={t("theme.bgPickerClose")} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="background-picker-grid">
          {LOGIN_BACKGROUND_OPTIONS.map((option, index) => {
            const selected = option.src === selectedSrc;
            return (
              <button
                type="button"
                key={option.id}
                className={`background-choice${selected ? " background-choice-selected" : ""}`}
                aria-label={t("theme.bgOption", { number: index + 1 })}
                aria-pressed={selected}
                onClick={() => onSelect(option.src)}
              >
                <video src={option.src} autoPlay muted loop playsInline preload="metadata" />
                {selected && (
                  <span className="background-choice-check" aria-hidden="true">
                    <SettingIcon name="check" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="background-picker-actions">
          <button type="button" className="secondary" onClick={onReset}>
            {t("theme.bgReset")}
          </button>
        </div>
      </section>
    </div>
  );
}

function ThemeCustomizer({
  theme,
  onThemeChange,
  onReset,
  loginBackgroundSrc,
  onLoginBackgroundChange,
  onLoginBackgroundReset
}: {
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  onReset: () => void;
  loginBackgroundSrc: string;
  onLoginBackgroundChange: (src: string) => void;
  onLoginBackgroundReset: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const customizerRef = useRef<HTMLDivElement>(null);
  const panelPresence = useMotionPresence(open, MOTION_FAST_MS);
  const backgroundPickerPresence = useMotionPresence(backgroundPickerOpen, MOTION_BASE_MS);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (customizerRef.current && !customizerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  const updateColor = (field: ThemeField, color: string) => {
    if (!isHexColor(color)) return;
    onThemeChange({
      ...theme,
      [field]: color
    });
  };

  return (
    <div className="theme-customizer" ref={customizerRef}>
      {panelPresence.mounted && (
        <section className="theme-panel" aria-label={t("theme.customize")} data-state={panelPresence.state}>
          <div className="theme-panel-header">
            <div>
              <h2>{t("theme.customize")}</h2>
              <p>{t("theme.savedLocal")}</p>
            </div>
            <button type="button" className="theme-close" aria-label={t("theme.close")} onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>

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

          <div className="theme-actions">
            <button type="button" className="secondary" onClick={() => setBackgroundPickerOpen(true)}>
              {t("theme.background")}
            </button>
            <button type="button" className="secondary" onClick={onReset}>
              {t("theme.reset")}
            </button>
          </div>
        </section>
      )}
      {backgroundPickerPresence.mounted && (
        <BackgroundPickerModal
          selectedSrc={loginBackgroundSrc}
          onSelect={onLoginBackgroundChange}
          onReset={onLoginBackgroundReset}
          onClose={() => setBackgroundPickerOpen(false)}
          motionState={backgroundPickerPresence.state}
        />
      )}
      <button
        type="button"
        className="theme-fab"
        aria-label={t("theme.customize")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ThemeIcon />
      </button>
    </div>
  );
}

// ###############################################
// Authentication Screens
// ###############################################

function RegisterPage({ onAuthenticated, backgroundSrc }: { onAuthenticated: AuthenticatedHandler; backgroundSrc: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.register({ email, display_name: displayName, password });
      setSetup(response.mfa_setup);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout backgroundSrc={backgroundSrc}>
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>{t("register.title")}</h2>
            <p>{t("register.body")}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} autoComplete="name" />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy}>
              {busy ? t("register.busy") : t("register.submit")}
            </button>
          </form>
          <button className="link-button" onClick={() => go("login")}>
            {t("register.haveAccount")}
          </button>
        </>
      )}
    </AuthLayout>
  );
}

function LoginPage({ onAuthenticated, backgroundSrc }: { onAuthenticated: AuthenticatedHandler; backgroundSrc: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
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
      handleLoginResponse(await api.login({ email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout backgroundSrc={backgroundSrc}>
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>{t("login.title")}</h2>
            <p>{t("login.body")}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy}>
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
    </AuthLayout>
  );
}

function OAuthAuthorizeLayout({
  context,
  children,
  backgroundSrc
}: {
  context: AuthorizeContext | null;
  children: ReactNode;
  backgroundSrc: string;
}) {
  const { t } = useI18n();
  return (
    <main className="oauth-page">
      <AuthWallpaper videoSrc={backgroundSrc} />
      <section className="oauth-card">
        <header className="oauth-header">
          <div className="oauth-brand">
            <LogoMark />
            <span>{PRODUCT_NAME}</span>
          </div>
          <LanguageSwitcher className="oauth-language-switcher" />
          <div className="oauth-context">
            <span>{t("oauth.continueTo")}</span>
            <strong>{context?.client_name ?? t("oauth.connectedApp")}</strong>
          </div>
        </header>
        {context && (
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
  backgroundSrc
}: {
  user: User | null;
  loading: boolean;
  onAuthenticated: AuthenticatedHandler;
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
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        if (active) setContextError(err instanceof ApiError ? err.message : t("oauth.loadFailed"));
      }
    }

    loadContext();
    return () => { active = false; };
  }, [authorizeRequest, t]);

  function continueToAuthorize() {
    if (authorizeRequest) window.location.href = authorizeRequest.next;
  }

  function handleLoginResponse(response: LoginResponse) {
    if (response.user) {
      onAuthenticated(response.user);
      return;
    }
    if (response.mfa_required && response.challenge_id) {
      setMfaChallenge(response.challenge_id);
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
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.register({ email, display_name: displayName, password });
      setSetup(response.mfa_setup);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OAuthAuthorizeLayout context={context} backgroundSrc={backgroundSrc}>
      <Alert message={contextError} />
      {!context && !contextError && <Alert message={t("oauth.loadingRequest")} tone="info" />}
      {loading ? (
        <Alert message={t("oauth.checkingPortalSession")} tone="info" />
      ) : user ? (
        <div className="oauth-signed-in">
          <Avatar user={user} />
          <div>
            <strong>{user.display_name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="primary full" onClick={continueToAuthorize} disabled={!authorizeRequest || !context || Boolean(contextError)}>
            {t("oauth.continueButton")}
          </button>
        </div>
      ) : setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} onAuthenticated={onAuthenticated} />
      ) : mode === "register" ? (
        <>
          <div className="panel-header">
            <h2>{t("oauth.createTitle")}</h2>
            <p>{t("oauth.createBody", { app: context?.client_name ?? t("oauth.connectedApp") })}</p>
          </div>
          <form onSubmit={submitRegister} className="form-stack">
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} autoComplete="name" />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy || !context || Boolean(contextError)}>
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
            <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label={t("common.password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy || !context || Boolean(contextError)}>
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

function ForgotPasswordPage({ backgroundSrc }: { backgroundSrc: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setResetLink(null);
    try {
      const response = await api.forgotPassword({ email });
      setMessage(response.message);
      setResetLink(response.reset_link ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("forgot.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout backgroundSrc={backgroundSrc}>
      <div className="panel-header">
        <h2>{t("forgot.title")}</h2>
        <p>{t("forgot.body")}</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Alert message={error} />
        <Alert message={message} tone="success" />
        {resetLink && (
          <div className="dev-reset-link">
            <span>{t("forgot.devLink")}</span>
            <button type="button" onClick={() => { window.location.href = resetLink; }}>
              {resetLink}
            </button>
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? t("forgot.busy") : t("forgot.submit")}
        </button>
      </form>
      <button className="link-button" onClick={() => go("login")}>
        {t("common.backToSignIn")}
      </button>
    </AuthLayout>
  );
}

function ResetPasswordPage({ backgroundSrc }: { backgroundSrc: string }) {
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
        if (active) setError(err instanceof ApiError ? err.message : t("reset.inspectFailed"));
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
      setError(err instanceof ApiError ? err.message : t("reset.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout backgroundSrc={backgroundSrc}>
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
          <Field label={t("common.newPassword")} type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <Field label={t("reset.confirmPassword")} type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          {inspect.mfa_required && (
            <>
              <Field label={t("common.authenticatorCode")} value={mfaCode} onChange={setMfaCode} autoComplete="one-time-code" />
              <div className="field-help">{t("reset.mfaHelp")}</div>
            </>
          )}
          <Alert message={error} />
          <button className="primary" disabled={busy}>
            {busy ? t("reset.busy") : t("reset.submit")}
          </button>
        </form>
      )}
    </AuthLayout>
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

function MfaSetupPanel({ setup, onAuthenticated }: { setup: MfaSetup; onAuthenticated: (user: User) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaSetup({ challenge_id: setup.challenge_id, code });
      if (response.user) onAuthenticated(await confirmedSessionUser(t));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("mfa.setupFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>{t("mfa.setupTitle")}</h2>
        <p>{t("mfa.setupBody")}</p>
      </div>
      <div className="qr-wrap">
        <img src={setup.qr_code_data_url} alt={t("mfa.qrAlt")} />
      </div>
      <div className="setup-key">{setup.manual_entry_key}</div>
      <form onSubmit={submit} className="form-stack">
        <Field label={t("common.verificationCode")} value={code} onChange={setCode} autoComplete="one-time-code" />
        <Alert message={error} />
        <button className="primary" disabled={busy}>
          {busy ? t("mfa.verifying") : t("mfa.finishSetup")}
        </button>
      </form>
    </>
  );
}

function MfaVerifyPanel({ challengeId, onAuthenticated }: { challengeId: string; onAuthenticated: (user: User) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaLogin({ challenge_id: challengeId, code });
      if (response.user) onAuthenticated(await confirmedSessionUser(t));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("mfa.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>{t("mfa.verifyTitle")}</h2>
        <p>{t("mfa.verifyBody")}</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label={t("common.verificationCode")} value={code} onChange={setCode} autoComplete="one-time-code" />
        <Alert message={error} />
        <button className="primary" disabled={busy}>
          {busy ? t("mfa.verifying") : t("mfa.verifyContinue")}
        </button>
      </form>
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

function ProfileOnboardingPanel({
  user,
  setUser,
  onFinished,
  completeOnSkip = false
}: {
  user: User;
  setUser: (user: User) => void;
  onFinished: () => void;
  completeOnSkip?: boolean;
}) {
  const { t } = useI18n();
  const field = user.profile_completion.next_prompt_field;
  const genderOptions = GENDER_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  const [value, setValue] = useState("");
  const [gender, setGender] = useState<GenderValue | "">("");
  const [genderCustom, setGenderCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function saveStep(event: FormEvent) {
    event.preventDefault();
    if (!field) return;
    setBusy(true);
    setError(null);
    setSessionExpired(false);
    try {
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
      } else {
        const nextValue = optionalText(value);
        if (!nextValue) {
          setError(t("onboarding.enterOrSkip", { field: onboardingCopy(field, t).label.toLowerCase() }));
          return;
        }
        payload = { [field]: nextValue } as ProfileUpdatePayload;
      }
      await completeAndContinue(await api.updateProfile(payload));
    } catch (err) {
      handleOnboardingError(err, t("onboarding.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function skipStep() {
    if (!field) return;
    setBusy(true);
    setError(null);
    setSessionExpired(false);
    try {
      if (completeOnSkip) {
        setUser(await skipAndCompleteOnboardingPrompt(field));
        onFinished();
        return;
      }
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
        <button className="primary" onClick={finishWithoutPrompt} disabled={busy}>
          {busy ? t("onboarding.finishing") : t("common.continue")}
        </button>
      </>
    );
  }

  const copy = onboardingCopy(field, t);

  return (
    <>
      <div className="panel-header">
        <h2>{copy.title}</h2>
        <p>{copy.helper}</p>
      </div>
      <div className="onboarding-progress">
        {t("onboarding.nextDetail", { field: humanize(field) })}
      </div>
      <form onSubmit={saveStep} className="form-stack">
        {field === "gender" ? (
          <>
            <SelectField<GenderValue>
              label={copy.label}
              value={gender}
              onChange={setGender}
              options={genderOptions}
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
          <button className="primary" disabled={busy}>
            {busy ? t("common.saving") : t("onboarding.saveContinue")}
          </button>
          <button type="button" className="secondary" onClick={skipStep} disabled={busy}>
            {t("common.skip")}
          </button>
        </div>
      </form>
    </>
  );
}

function ProfileOnboardingPage({
  user,
  setUser,
  onFinished,
  backgroundSrc
}: {
  user: User;
  setUser: (user: User) => void;
  onFinished: () => void;
  backgroundSrc: string;
}) {
  return (
    <AuthLayout backgroundSrc={backgroundSrc}>
      <ProfileOnboardingPanel user={user} setUser={setUser} onFinished={onFinished} />
    </AuthLayout>
  );
}

// ###############################################
// Account Screens
// ###############################################

function AccountHomePage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const pictureModalPresence = useMotionPresence(pictureModalOpen, MOTION_BASE_MS);
  const accountActions: Array<{
    title: string;
    description: string;
    icon: Parameters<typeof SettingIcon>[0]["name"];
    tone: "green" | "cyan" | "blue";
    onClick: () => void;
  }> = [
    {
      title: t("nav.personalInfo"),
      description: t("account.personalInfoDesc"),
      icon: "id",
      tone: "green",
      onClick: () => go("profile")
    },
    {
      title: t("nav.security"),
      description: t("account.securityDesc"),
      icon: "shield",
      tone: "cyan",
      onClick: () => go("security")
    },
    {
      title: t("common.password"),
      description: t("account.passwordDesc"),
      icon: "key",
      tone: "cyan",
      onClick: () => goSecuritySection("password")
    },
    {
      title: t("common.activeSessions"),
      description: t("account.sessionsDesc"),
      icon: "devices",
      tone: "cyan",
      onClick: () => goSecuritySection("sessions")
    },
    {
      title: t("common.extraVerification"),
      description: user.mfa_enabled ? t("account.verificationOnDesc") : t("account.verificationOffDesc"),
      icon: "shield",
      tone: "blue",
      onClick: () => goSecuritySection("verification")
    },
    {
      title: t("account.activityTitle"),
      description: t("account.activityDesc"),
      icon: "activity",
      tone: "blue",
      onClick: () => goSecuritySection("activity")
    }
  ];

  function search(event: FormEvent) {
    event.preventDefault();
    go(routeForSearch(query));
  }

  return (
    <section className="account-home">
      <div className="home-identity">
        <button className="home-avatar-wrap" aria-label={t("avatar.change")} onClick={() => setPictureModalOpen(true)}>
          <Avatar user={user} />
          <span aria-hidden="true">
            <CameraIcon />
          </span>
        </button>
        <div className="home-identity-copy">
          <h1>{user.display_name}</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <form className="home-search" onSubmit={search}>
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("account.search", { product: PRODUCT_NAME })}
          aria-label={t("account.search", { product: PRODUCT_NAME })}
        />
      </form>

      <div className="quick-actions" aria-label={t("account.quickActions")}>
        <button onClick={() => go("profile")}>{t("common.profile")}</button>
        <button onClick={() => go("security")}>{t("common.password")}</button>
        <button onClick={() => go("security")}>{t("common.devices")}</button>
        <button onClick={() => go("security")}>{t("common.verification")}</button>
      </div>

      <p className="home-privacy-note">
        {t("account.privacy")}
      </p>

      <div className="home-account-actions" aria-label={t("account.settings")}>
        {accountActions.map((action) => (
          <button key={action.title} className="home-account-action" onClick={action.onClick}>
            <span className={`home-account-action-icon home-account-action-icon-${action.tone}`}>
              <SettingIcon name={action.icon} />
            </span>
            <span>
              <strong>{action.title}</strong>
              <span>{action.description}</span>
            </span>
          </button>
        ))}
      </div>

      {pictureModalPresence.mounted && (
        <div
          className="picture-modal-overlay"
          data-state={pictureModalPresence.state}
          role="dialog"
          aria-modal="true"
          aria-label={t("avatar.change")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPictureModalOpen(false);
          }}
        >
          <ProfilePictureModal user={user} setUser={setUser} onClose={() => setPictureModalOpen(false)} />
        </div>
      )}

    </section>
  );
}

function ProfilePage({ user }: { user: User }) {
  const { t } = useI18n();
  return (
    <SettingsPage title={t("profile.title")}>
      <div className="settings-group">
        <SettingsRow
          icon="camera"
          title={t("common.profilePicture")}
          right={<Avatar user={user} />}
          onClick={() => goProfileEdit("picture")}
        />
        <SettingsRow icon="id" title={t("common.name")} value={fullName(user)} onClick={() => goProfileEdit("name")} />
        <SettingsRow
          icon="user"
          title={t("common.gender")}
          value={user.gender === "custom" ? displayValue(user.gender_custom, t("common.notSet")) : genderLabel(user.gender, t)}
          onClick={() => goProfileEdit("gender")}
        />
        <SettingsRow icon="mail" title={t("common.email")} value={user.email} />
        <SettingsRow
          icon="phone"
          title={t("common.phone")}
          value={user.phone_number ? `${user.phone_number}${user.phone_verified ? ` · ${t("common.verified")}` : ` · ${t("profile.phoneNotVerified")}`}` : t("common.notAdded")}
          onClick={() => goProfileEdit("phone")}
        />
        <SettingsRow icon="cake" title={t("common.birthday")} value={displayValue(user.date_of_birth, t("common.notSet"))} onClick={() => goProfileEdit("birthday")} />
        <SettingsRow icon="globe" title={t("common.language")} value={primaryLanguage(user, t("common.notSet"))} onClick={() => goProfileEdit("language")} />
        <SettingsRow icon="clock" title={t("common.timezone")} value={displayValue(user.timezone, t("common.notSet"))} onClick={() => goProfileEdit("timezone")} />
      </div>
    </SettingsPage>
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
  const { t, setLanguage } = useI18n();
  const [displayName, setDisplayName] = useState(user.display_name);
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number ?? "");
  const [gender, setGender] = useState<GenderValue | "">(user.gender ?? "");
  const [genderCustom, setGenderCustom] = useState(user.gender_custom ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.date_of_birth ?? "");
  const [languageChoice, setLanguageChoice] = useState<SupportedLanguage>(() => resolveSupportedLanguage(user.locale));
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let payload: ProfileUpdatePayload;
      if (field === "name") {
        payload = {
          display_name: displayName.trim(),
          first_name: optionalText(firstName),
          last_name: optionalText(lastName)
        };
      } else if (field === "gender") {
        payload = {
          display_name: user.display_name,
          gender: gender || null,
          gender_custom: gender === "custom" ? optionalText(genderCustom) : null
        };
      } else if (field === "phone") {
        payload = {
          display_name: user.display_name,
          phone_number: optionalText(phoneNumber)
        };
      } else if (field === "birthday") {
        payload = {
          display_name: user.display_name,
          date_of_birth: optionalText(dateOfBirth)
        };
      } else if (field === "language") {
        payload = {
          display_name: user.display_name,
          locale: localeForLanguage(languageChoice)
        };
      } else {
        payload = {
          display_name: user.display_name,
          timezone: optionalText(timezone)
        };
      }

      const updated = await api.updateProfile(payload);
      setUser(updated);
      if (field === "language") {
        const nextLanguage = resolveSupportedLanguage(updated.locale);
        setLanguage(nextLanguage);
      }
      go("profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("profile.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (field === "picture") {
    return (
      <section className="picture-edit-page">
        <ProfilePictureModal user={user} setUser={setUser} onClose={() => go("profile")} />
      </section>
    );
  }

  const detailByField: Record<Exclude<ProfileEditField, "picture">, { label: string; description: string }> = {
    name: {
      label: t("profile.edit.accountName"),
      description: t("profile.edit.accountNameBody", { product: PRODUCT_NAME })
    },
    gender: {
      label: t("common.gender"),
      description: t("profile.edit.genderBody")
    },
    phone: {
      label: user.phone_verified ? t("profile.edit.phoneVerified") : t("profile.edit.phoneNotVerified"),
      description: t("profile.edit.phoneBody")
    },
    birthday: {
      label: t("common.birthday"),
      description: t("profile.edit.birthdayBody")
    },
    language: {
      label: t("common.language"),
      description: t("profile.edit.languageBody")
    },
    timezone: {
      label: t("common.timezone"),
      description: t("profile.edit.timezoneBody")
    }
  };
  const editDetail = detailByField[field];

  return (
    <form className="profile-edit-card" onSubmit={saveProfile}>
      <div className="profile-edit-card-copy">
        <span>{editDetail.label}</span>
        <p>{editDetail.description}</p>
      </div>
      <div className="profile-edit-fields">
        {field === "name" && (
          <div className="profile-name-grid">
            <div className="profile-name-full">
              <Field label={t("common.displayName")} value={displayName} onChange={setDisplayName} required />
            </div>
            <Field label={t("profile.firstName")} value={firstName} onChange={setFirstName} />
            <Field label={t("profile.lastName")} value={lastName} onChange={setLastName} />
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
          <>
            <Field label={t("onboarding.phoneLabel")} type="tel" inputMode="tel" value={phoneNumber} onChange={setPhoneNumber} placeholder="+1 555 123 4567" />
            <div className="field-help">{t("profile.phoneHelp")}</div>
          </>
        )}
        {field === "birthday" && (
          <Field label={t("profile.dateOfBirth")} type="date" value={dateOfBirth} onChange={setDateOfBirth} />
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
          <Field label={t("common.timezone")} value={timezone} onChange={setTimezone} placeholder="Asia/Kuala_Lumpur" />
        )}
      </div>
      <Alert message={error} />
      <div className="button-row profile-edit-actions">
        <button className="primary" disabled={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="secondary" onClick={() => go("profile")} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function SecurityPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const { t, formatDateTime: formatForLanguage } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityAction, setSecurityAction] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<SecuritySection | null>(() => securitySectionFromUrl());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshSecurityData = useCallback(async () => {
    setSecurityLoading(true);
    setSecurityError(null);
    try {
      const [nextSessions, nextEvents] = await Promise.all([
        api.listSessions(),
        api.listSecurityEvents()
      ]);
      setSessions(nextSessions);
      setEvents(nextEvents);
    } catch (err) {
      setSecurityError(err instanceof ApiError ? err.message : t("security.loadFailed"));
    } finally {
      setSecurityLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refreshSecurityData();
  }, [refreshSecurityData]);

  useEffect(() => {
    function syncSectionFromUrl() {
      setExpandedSection(securitySectionFromUrl());
    }

    syncSectionFromUrl();
    window.addEventListener("popstate", syncSectionFromUrl);
    return () => window.removeEventListener("popstate", syncSectionFromUrl);
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage(t("security.passwordChanged"));
      void refreshSecurityData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("security.passwordChangeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.disableMfa({ current_password: mfaPassword, code: mfaCode });
      setUser(updated);
      setMfaPassword("");
      setMfaCode("");
      setMessage(t("security.mfaDisabled"));
      void refreshSecurityData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("security.mfaDisableFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function enableMfa() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setSetup(await api.startMfaSetup());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("security.mfaStartFailed"));
    } finally {
      setBusy(false);
    }
  }

  const onMfaEnabled = (updated: User) => {
    setUser(updated);
    setSetup(null);
    setMessage(t("security.mfaEnabled"));
    void refreshSecurityData();
  };

  async function revokeSession(session: SessionInfo) {
    setSecurityAction(session.id);
    setSecurityError(null);
    setMessage(null);
    try {
      await api.revokeSession(session.id);
      setMessage(t("security.sessionSignedOut"));
      await refreshSecurityData();
    } catch (err) {
      setSecurityError(err instanceof ApiError ? err.message : t("security.signOutSessionFailed"));
    } finally {
      setSecurityAction(null);
    }
  }

  async function logoutOtherSessions() {
    setSecurityAction("logout-others");
    setSecurityError(null);
    setMessage(null);
    try {
      await api.logoutOtherSessions();
      setMessage(t("security.otherDevicesSignedOut"));
      await refreshSecurityData();
    } catch (err) {
      setSecurityError(err instanceof ApiError ? err.message : t("security.signOutOthersFailed"));
    } finally {
      setSecurityAction(null);
    }
  }

  return (
    <SettingsPage title={t("security.title")}>
      <button className="settings-tip-card" onClick={() => setExpandedSection("verification")}>
        <span className="tip-icon">
          <SettingIcon name="shield" />
        </span>
        <span>
          <strong>{user.mfa_enabled ? t("security.protectedTitle") : t("security.addProtectionTitle")}</strong>
          <span>{user.mfa_enabled ? t("security.protectedBody") : t("security.addProtectionBody")}</span>
        </span>
      </button>

      <div className="settings-section">
        <h2>{t("security.recentActivity")}</h2>
        <p>{securityLoading ? t("security.loadingActivity") : latestSecurityEvent(events, t, formatForLanguage)}</p>
        <div className="settings-group">
          <SettingsRow
            icon="activity"
            title={t("account.activityTitle")}
            value={events.length === 0 ? t("security.noRecentActivity") : t("security.eventsCount", { count: events.length })}
            onClick={() => setExpandedSection(expandedSection === "activity" ? null : "activity")}
          />
          <MotionPanel open={expandedSection === "activity"}>
              <Alert message={securityError} />
              {securityLoading ? (
                <Alert message={t("security.loadingActivityInline")} tone="info" />
              ) : events.length === 0 ? (
                <div className="empty-inline">{t("security.noActivity")}</div>
              ) : (
                <div className="record-list">
                  {events.map((event) => (
                    <div className="record-item event-item" key={event.id}>
                      <div>
                        <div className="record-title">
                          <strong>{humanize(event.event_type)}</strong>
                          <span>{formatForLanguage(event.created_at)}</span>
                        </div>
                        <p>{displayValue(event.device_label, t("security.unknownDevice"))}</p>
                        <div className="record-meta">
                          <span>{t("security.ip")}: {displayValue(event.ip_address, t("common.notSet"))}</span>
                          <span>{t("security.userAgent")}: {displayValue(event.user_agent, t("common.notSet"))}</span>
                        </div>
                        <div className="metadata-line">{metadataSummary(event.metadata, t)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            onClick={() => setExpandedSection(expandedSection === "verification" ? null : "verification")}
          />
          <MotionPanel open={expandedSection === "verification"}>
              {setup ? (
                <MfaSetupPanel setup={setup} onAuthenticated={onMfaEnabled} />
              ) : user.mfa_enabled ? (
                <form className="form-stack" onSubmit={disableMfa}>
                  <Field label={t("common.currentPassword")} type="password" value={mfaPassword} onChange={setMfaPassword} />
                  <Field label={t("common.verificationCode")} value={mfaCode} onChange={setMfaCode} />
                  <button className="secondary" disabled={busy}>
                    {t("security.turnOffMfa")}
                  </button>
                </form>
              ) : (
                <button className="primary" onClick={enableMfa} disabled={busy}>
                  {t("security.turnOnMfa")}
                </button>
              )}
              <Alert message={error} />
              <Alert message={message} tone="success" />
          </MotionPanel>

          <SettingsRow
            icon="key"
            title={t("common.password")}
            value={t("account.passwordDesc")}
            onClick={() => setExpandedSection(expandedSection === "password" ? null : "password")}
          />
          <MotionPanel open={expandedSection === "password"}>
              <form className="form-stack" onSubmit={changePassword}>
                <Field label={t("common.currentPassword")} type="password" value={currentPassword} onChange={setCurrentPassword} />
                <Field label={t("common.newPassword")} type="password" value={newPassword} onChange={setNewPassword} />
                <button className="primary" disabled={busy}>
                  {t("security.changePassword")}
                </button>
              </form>
              <Alert message={error} />
              <Alert message={message} tone="success" />
          </MotionPanel>

          <SettingsRow
            icon="devices"
            title={t("common.activeSessions")}
            value={securityLoading ? t("security.sessionsLoading") : t("security.sessionsCount", { count: sessions.length, label: sessions.length === 1 ? t("security.session") : t("security.sessions") })}
            onClick={() => setExpandedSection(expandedSection === "sessions" ? null : "sessions")}
          />
          <MotionPanel open={expandedSection === "sessions"}>
              <div className="split-header compact-header">
                <div>
                  <h3>{t("security.devicesSignedIn")}</h3>
                  <p>{t("security.devicesBody")}</p>
                </div>
                <button className="secondary" onClick={logoutOtherSessions} disabled={securityAction !== null || sessions.length <= 1}>
                  {securityAction === "logout-others" ? t("security.signingOut") : t("security.signOutOtherDevices")}
                </button>
              </div>
              <Alert message={securityError} />
              {securityLoading ? (
                <Alert message={t("security.sessionsLoading")} tone="info" />
              ) : sessions.length === 0 ? (
                <div className="empty-inline">{t("security.noSessions")}</div>
              ) : (
                <div className="record-list">
                  {sessions.map((session) => (
                    <div className="record-item" key={session.id}>
                      <div>
                        <div className="record-title">
                          <strong>{displayValue(session.device_label, t("security.unknownDevice"))}</strong>
                          {session.is_current && <span className="current-badge">{t("security.current")}</span>}
                        </div>
                        <p>{displayValue(session.user_agent, t("security.noUserAgent"))}</p>
                        <div className="record-meta">
                          <span>{t("security.loginIp")}: {displayValue(session.login_ip_address, t("common.notSet"))}</span>
                          <span>{t("security.lastIp")}: {displayValue(session.last_seen_ip_address, t("common.notSet"))}</span>
                          <span>{t("security.lastSeen")}: {formatForLanguage(session.last_seen_at)}</span>
                          <span>{t("security.expires")}: {formatForLanguage(session.expires_at)}</span>
                        </div>
                      </div>
                      {!session.is_current && (
                        <button className="secondary" onClick={() => revokeSession(session)} disabled={securityAction !== null}>
                          {securityAction === session.id ? t("security.signingOut") : t("common.signOut")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </MotionPanel>
        </div>
      </div>
    </SettingsPage>
  );
}

// ###############################################
// App Composition
// ###############################################

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings);
  const [loginBackgroundSrc, setLoginBackgroundSrc] = useState(loadLoginBackgroundSrc);
  const [language, setLanguageState] = useState<SupportedLanguage>(loadStoredLanguage);
  const { user, setUser, loading } = useSession();

  useEffect(() => {
    const updateRoute = () => setRoute(getRoute());
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

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  const i18nValue = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values),
    formatDateTime: (value) => formatDateTime(value, language)
  }), [language, setLanguage]);

  const updateTheme = useCallback((nextTheme: ThemeSettings) => {
    const normalized = normalizeTheme(nextTheme);
    setTheme(normalized);
    saveThemeSettings(normalized);
  }, []);

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
    saveThemeSettings(DEFAULT_THEME);
  }, []);

  const updateLoginBackground = useCallback((src: string) => {
    if (!isLoginBackgroundSrc(src)) return;
    setLoginBackgroundSrc(src);
    saveLoginBackgroundSrc(src);
  }, []);

  const resetLoginBackground = useCallback(() => {
    setLoginBackgroundSrc(DEFAULT_LOGIN_BACKGROUND_SRC);
    saveLoginBackgroundSrc(DEFAULT_LOGIN_BACKGROUND_SRC);
  }, []);

  const withThemeCustomizer = useCallback((content: ReactNode) => (
    <>
      {content}
      <ThemeCustomizer
        theme={theme}
        onThemeChange={updateTheme}
        onReset={resetTheme}
        loginBackgroundSrc={loginBackgroundSrc}
        onLoginBackgroundChange={updateLoginBackground}
        onLoginBackgroundReset={resetLoginBackground}
      />
    </>
  ), [loginBackgroundSrc, resetLoginBackground, resetTheme, theme, updateLoginBackground, updateTheme]);

  const withProviders = useCallback((content: ReactNode) => (
    <I18nContext.Provider value={i18nValue}>
      {withThemeCustomizer(content)}
    </I18nContext.Provider>
  ), [i18nValue, withThemeCustomizer]);

  const finishOnboarding = useCallback(() => {
    if (pendingRedirect) {
      window.location.href = pendingRedirect;
      return;
    }
    go("account");
  }, [pendingRedirect]);

  const onAuthenticated = useCallback((nextUser: User) => {
    setUser(nextUser);
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
      setUser(null);
      go("login");
    }
  }, [setUser]);

  const protectedPage = useMemo(() => {
    if (route === "security" && user) return <SecurityPage user={user} setUser={setUser} />;
    if (route === "profile" && user) return <ProfilePage user={user} />;
    if (route === "account" && user) return <AccountHomePage user={user} setUser={setUser} />;
    return null;
  }, [route, setUser, user]);

  if (route === "register") return withProviders(<RegisterPage onAuthenticated={onAuthenticated} backgroundSrc={loginBackgroundSrc} />);
  if (route === "login") return withProviders(<LoginPage onAuthenticated={onAuthenticated} backgroundSrc={loginBackgroundSrc} />);
  if (route === "authorize") {
    return withProviders(
      <OAuthAuthorizePage user={user} loading={loading} onAuthenticated={onAuthenticated} backgroundSrc={loginBackgroundSrc} />
    );
  }
  if (route === "forgot-password") return withProviders(<ForgotPasswordPage backgroundSrc={loginBackgroundSrc} />);
  if (route === "reset-password") return withProviders(<ResetPasswordPage backgroundSrc={loginBackgroundSrc} />);
  if (route === "profile-onboarding" && user) {
    return withProviders(
      <ProfileOnboardingPage user={user} setUser={setUser} onFinished={finishOnboarding} backgroundSrc={loginBackgroundSrc} />
    );
  }
  if (loading || !user) return withProviders(<StandaloneAccessState loading={loading} backgroundSrc={loginBackgroundSrc} />);
  if (isLegalRoute(route)) {
    return withProviders(
      <LegalShell user={user} setUser={setUser} route={route} onLogout={onLogout} />
    );
  }
  if (route === "profile-edit") {
    const field = profileEditField();
    return withProviders(
      <ProfileEditDetailShell user={user} setUser={setUser} title={profileEditTitle(field, i18nValue.t)} onLogout={onLogout}>
        <ProfileEditPage user={user} setUser={setUser} field={field} />
      </ProfileEditDetailShell>
    );
  }
  if (!protectedPage) return withProviders(<StandaloneAccessState loading={loading} backgroundSrc={loginBackgroundSrc} />);

  const activeConsoleRoute = route as ConsoleRoute;

  return withProviders(
    <Shell user={user} setUser={setUser} route={activeConsoleRoute} onLogout={onLogout}>
      {protectedPage}
    </Shell>
  );
}
