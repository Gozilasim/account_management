/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-12 02:44
Description: Main GozilaSim ID React UI for authentication, profile, and sign-in protection screens.
*/

// ###############################################
// Imports
// ###############################################

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";
import logoMarkSrc from "./assets/gozilasim-logo.png";
import type {
  AuthorizeContext,
  AvatarHistoryItem,
  GenderValue,
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
const WALLPAPER_VIDEO_SRC = import.meta.env.VITE_PORTAL_WALLPAPER_SRC as string | undefined;

const GENDER_OPTIONS: Array<{ value: GenderValue; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "custom", label: "Custom" }
];

// ###############################################
// Routing Helpers
// ###############################################

type Route = "login" | "register" | "forgot-password" | "reset-password" | "profile-onboarding" | "authorize" | "account" | "profile" | "profile-edit" | "security";
type ConsoleRoute = Extract<Route, "account" | "profile" | "security">;
type AuthenticatedHandler = (user: User, options?: { showOnboarding?: boolean }) => void;
type ProfileEditField = "name" | "gender" | "phone" | "birthday" | "language" | "timezone" | "picture";

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

const PROFILE_EDIT_FIELDS: ProfileEditField[] = ["name", "gender", "phone", "birthday", "language", "timezone", "picture"];

function getRoute(): Route {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (
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
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function goProfileEdit(field: ProfileEditField) {
  window.history.pushState({}, "", `/profile-edit?field=${field}`);
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

function profileEditTitle(field: ProfileEditField) {
  const titleByField: Record<ProfileEditField, string> = {
    picture: "Profile picture",
    name: "Name",
    gender: "Gender",
    phone: "Phone",
    birthday: "Birthday",
    language: "Language",
    timezone: "Timezone"
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

function oauthScopeLabel(scope: string) {
  if (scope === "openid") return "Sign-in identity";
  if (scope === "email") return "Email address";
  if (scope === "profile") return "Profile details";
  if (scope === "phone") return "Phone number";
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

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function displayValue(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() || fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) return "No extra details";
  return Object.entries(metadata)
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`)
    .join(", ");
}

function genderLabel(value: string | null) {
  if (!value) return "Not set";
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? humanize(value);
}

function fullName(user: User) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
}

function primaryLanguage(user: User) {
  return displayValue(user.locale, "Not set");
}

function latestSecurityEvent(events: SecurityEvent[]) {
  if (events.length === 0) return "No recent security activity";
  const event = events[0];
  return `${humanize(event.event_type)} · ${formatDateTime(event.created_at)}`;
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
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as T | "")}>
        <option value="">{props.placeholder ?? "Select an option"}</option>
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

function AuthWallpaper() {
  return (
    <div className="auth-wallpaper" aria-hidden="true">
      {WALLPAPER_VIDEO_SRC && (
        <video className="auth-wallpaper-video" autoPlay muted loop playsInline>
          <source src={WALLPAPER_VIDEO_SRC} type="video/mp4" />
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
  const [view, setView] = useState<"change" | "history">("change");
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<AvatarHistoryItem[]>(user.avatar_history ?? []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPresence = useMotionPresence(menuOpen, MOTION_FAST_MS);
  const selectedFileName = selectedFile?.name ?? "No file selected";

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
      setError(err instanceof ApiError ? err.message : "Profile picture history could not be loaded.");
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
      setError(err instanceof ApiError ? err.message : "Profile picture could not be restored.");
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
        setError("Choose an image to upload.");
        return;
      }
      setUser(await api.uploadAvatar(selectedFile));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profile image upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const menu = (
    <div className="picture-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className={`picture-more-button ${menuOpen ? "active" : ""}`}
        aria-label="More profile picture options"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        disabled={busy}
      >
        <MoreIcon />
      </button>
      {menuPresence.mounted && (
        <div className="picture-more-menu" role="menu" data-state={menuPresence.state}>
          <button type="button" role="menuitem" disabled>
            Profile picture visibility
          </button>
          <button type="button" role="menuitem" className={view === "history" ? "active" : ""} onClick={openHistoryView}>
            Past profile pictures
          </button>
          <button type="button" role="menuitem" disabled>
            Birthday settings
          </button>
          <button type="button" role="menuitem" disabled>
            Remove profile picture
          </button>
          <button type="button" role="menuitem" disabled>
            Help
          </button>
          <button type="button" role="menuitem" disabled>
            Send feedback
          </button>
        </div>
      )}
    </div>
  );

  if (view === "history") {
    return (
      <div className="picture-modal-card picture-history-card">
        <div className="picture-history-header">
          <button type="button" className="picture-back-button" aria-label="Back to change profile picture" onClick={() => setView("change")} disabled={busy}>
            <BackIcon />
          </button>
          <h1>Past profile pictures</h1>
          {menu}
        </div>

        <div className="picture-history-grid" aria-busy={historyLoading}>
          {history.map((item) => (
            <button
              key={item.public_id}
              type="button"
              className="picture-history-item"
              aria-label="Restore this profile picture"
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
        <button type="button" className="picture-close-button" aria-label="Close profile picture" onClick={onClose} disabled={busy}>
          <CloseIcon />
        </button>
        <h1>Change profile picture</h1>
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
            <strong>Upload from device</strong>
            <small>{selectedFileName}</small>
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
        </label>
        <button type="button" className="picture-action-row" disabled>
          <span className="picture-action-icon">
            <CameraIcon />
          </span>
          <span>
            <strong>Take a picture</strong>
            <small>Camera capture is not available yet.</small>
          </span>
        </button>
      </div>

      <Alert message={error} />
      <div className="button-row picture-buttons">
        <button className="primary" disabled={busy || !selectedFile}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const [topbarQuery, setTopbarQuery] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const appsLauncherRef = useRef<HTMLDivElement>(null);
  const accountMenuPresence = useMotionPresence(accountMenuOpen, MOTION_FAST_MS);
  const appsLauncherPresence = useMotionPresence(appsLauncherOpen, MOTION_FAST_MS);

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

  const navigateConsole = (nextRoute: ConsoleRoute) => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    go(nextRoute);
  };

  const openProfilePictureModal = () => {
    setAccountMenuOpen(false);
    setAppsLauncherOpen(false);
    setPictureModalOpen(true);
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
        <nav className="sidebar-nav" aria-label="Account sections">
          {CONSOLE_NAV.map((item) => (
            <button
              key={item.route}
              className={`nav-item ${route === item.route ? "active" : ""}`}
              onClick={() => navigateConsole(item.route)}
            >
              <span className={`nav-icon nav-icon-${item.tone}`}>
                <ConsoleIcon icon={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Secure account center</span>
        </div>
      </aside>

      <div className="console-shell">
        <header className="console-topbar">
          <form className="topbar-search" onSubmit={submitTopbarSearch}>
            <SearchIcon />
            <input
              value={topbarQuery}
              onChange={(event) => setTopbarQuery(event.target.value)}
              placeholder={`Search ${PRODUCT_NAME}`}
              aria-label={`Search ${PRODUCT_NAME}`}
            />
          </form>

          <div className="apps-menu" ref={appsLauncherRef}>
            <button
              className="icon-button"
              aria-label="Open apps launcher"
              aria-expanded={appsLauncherOpen}
              onClick={() => {
                setAppsLauncherOpen((open) => !open);
                setAccountMenuOpen(false);
              }}
            >
              <GridIcon />
            </button>
            {appsLauncherPresence.mounted && (
              <div className="apps-popover" role="dialog" aria-label="Apps launcher" data-state={appsLauncherPresence.state}>
                <div className="apps-launcher-panel">
                  <div className="apps-launcher-header">
                    <h2>Your favourites</h2>
                    <button className="apps-edit-button" aria-label="Edit favourite apps" disabled>
                      <PencilIcon />
                    </button>
                  </div>
                  <div className="apps-launcher-body" />
                </div>
              </div>
            )}
          </div>

          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="avatar-button"
              aria-label="Open account menu"
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
                <button className="popover-close" aria-label="Close account menu" onClick={() => setAccountMenuOpen(false)}>
                  <CloseIcon />
                </button>
                <div className="account-popover-email">{user.email}</div>
                <div className="account-popover-avatar">
                  <Avatar user={user} />
                  <button aria-label="Manage profile image" onClick={openProfilePictureModal}>
                    <CameraIcon />
                  </button>
                </div>
                <h2>Hi, {user.display_name}!</h2>
                <button className="account-manage-button" onClick={() => navigateConsole("profile")}>
                  Manage your {PRODUCT_NAME}
                </button>
                <div className="account-popover-actions">
                  <button onClick={onLogout}>Sign out</button>
                </div>
                <div className="account-popover-footer">Profile details and sign-in protection stay private to you.</div>
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
      {pictureModalOpen && (
        <div
          className="picture-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Change profile picture"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPictureModalOpen(false);
          }}
        >
          <ProfilePictureModal user={user} setUser={setUser} onClose={() => setPictureModalOpen(false)} />
        </div>
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuPresence = useMotionPresence(accountMenuOpen, MOTION_FAST_MS);

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
            aria-label="Open account menu"
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <Avatar user={user} />
          </button>
          {accountMenuPresence.mounted && (
            <div className="account-popover profile-edit-account-popover" role="menu" data-state={accountMenuPresence.state}>
              <button className="popover-close" aria-label="Close account menu" onClick={() => setAccountMenuOpen(false)}>
                <CloseIcon />
              </button>
              <div className="account-popover-email">{user.email}</div>
              <div className="account-popover-avatar">
                <Avatar user={user} />
                <button aria-label="Manage profile image" onClick={openProfilePictureModal}>
                  <CameraIcon />
                </button>
              </div>
              <h2>Hi, {user.display_name}!</h2>
              <button className="account-manage-button" onClick={() => navigateConsole("profile")}>
                Manage your {PRODUCT_NAME}
              </button>
              <div className="account-popover-actions">
                <button onClick={onLogout}>Sign out</button>
              </div>
              <div className="account-popover-footer">Profile details and sign-in protection stay private to you.</div>
            </div>
          )}
        </div>
      </header>

      <section key={title} className="profile-edit-stage motion-page" data-state="open">
        <div className="profile-edit-header">
          <button className="profile-edit-back" aria-label="Back to personal info" onClick={() => go("profile")}>
            <BackIcon />
          </button>
          <h1>{title}</h1>
        </div>
        {children}
      </section>
      {pictureModalOpen && (
        <div
          className="picture-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Change profile picture"
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

function Avatar({ user }: { user: User | null }) {
  if (user?.avatar_url) {
    return <img className="avatar" src={user.avatar_url} alt={`${user.display_name} avatar`} />;
  }
  return <div className="avatar avatar-fallback">{userInitials(user)}</div>;
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <AuthWallpaper />
      <header className="auth-header">
        <AuthBrand />
      </header>
      <section className="auth-layout">
        <div className="auth-copy">
          <h1>Access your workspace with one account.</h1>
          <p>Manage your profile, password, and sign-in protection from one quiet place.</p>
          <div className="auth-summary">
            <div className="auth-summary-item">
              <strong>Account details</strong>
              <span>Keep your name and image current across the apps you use.</span>
            </div>
            <div className="auth-summary-item">
              <strong>Sign-in protection</strong>
              <span>Extra verification appears only when your account needs it.</span>
            </div>
            <div className="auth-summary-item">
              <strong>Connected access</strong>
              <span>Move between your apps with the same secure account.</span>
            </div>
          </div>
        </div>
        <div className="panel auth-panel">{children}</div>
      </section>
    </main>
  );
}

function StandaloneAccessState({ loading }: { loading: boolean }) {
  return (
    <main className="auth-page auth-state-page">
      <AuthWallpaper />
      <header className="auth-header">
        <AuthBrand />
      </header>
      <section className="auth-state">
        <div className="panel empty-state">
          <h2>{loading ? "Loading account..." : "Sign in required"}</h2>
          <p>
            {loading
              ? "Checking whether you already have an active session."
              : `Sign in to ${PRODUCT_NAME} to view this page.`}
          </p>
          {!loading && (
            <button className="primary" onClick={() => go("login")}>
              Sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

// ###############################################
// Authentication Screens
// ###############################################

function RegisterPage({ onAuthenticated }: { onAuthenticated: AuthenticatedHandler }) {
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
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={(user) => onAuthenticated(user, { showOnboarding: true })} />
      ) : (
        <>
          <div className="panel-header">
            <h2>Create account</h2>
            <p>Set up your profile and add extra sign-in protection before you continue.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Display name" value={displayName} onChange={setDisplayName} autoComplete="name" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </button>
          </form>
          <button className="link-button" onClick={() => go("login")}>
            Already have an account? Sign in
          </button>
        </>
      )}
    </AuthLayout>
  );
}

function LoginPage({ onAuthenticated }: { onAuthenticated: AuthenticatedHandler }) {
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
      setError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>Sign in</h2>
            <p>Use your email and password to continue.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Checking..." : "Sign in"}
            </button>
          </form>
          <div className="link-stack">
            <button className="link-button" onClick={() => go("forgot-password")}>
              Forgot password?
            </button>
            <button className="link-button" onClick={() => go("register")}>
              Need an account? Register
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}

function OAuthAuthorizeLayout({
  context,
  children
}: {
  context: AuthorizeContext | null;
  children: ReactNode;
}) {
  return (
    <main className="oauth-page">
      <section className="oauth-card">
        <header className="oauth-header">
          <div className="oauth-brand">
            <LogoMark />
            <span>{PRODUCT_NAME}</span>
          </div>
          <div className="oauth-context">
            <span>Continue to</span>
            <strong>{context?.client_name ?? "connected app"}</strong>
          </div>
        </header>
        {context && (
          <div className="oauth-scopes" aria-label="Requested access">
            {context.scopes.map((scope) => (
              <span key={scope}>{oauthScopeLabel(scope)}</span>
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
  onAuthenticated
}: {
  user: User | null;
  loading: boolean;
  onAuthenticated: AuthenticatedHandler;
}) {
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
        setContextError("This sign-in request is missing required OAuth details.");
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
        if (active) setContextError(err instanceof ApiError ? err.message : "Could not load sign-in request.");
      }
    }

    loadContext();
    return () => { active = false; };
  }, [authorizeRequest]);

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
      setError(err instanceof ApiError ? err.message : "Login failed.");
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
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OAuthAuthorizeLayout context={context}>
      <Alert message={contextError} />
      {!context && !contextError && <Alert message="Loading sign-in request..." tone="info" />}
      {loading ? (
        <Alert message="Checking your Portal session..." tone="info" />
      ) : user ? (
        <div className="oauth-signed-in">
          <Avatar user={user} />
          <div>
            <strong>{user.display_name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="primary full" onClick={continueToAuthorize} disabled={!authorizeRequest || !context || Boolean(contextError)}>
            Continue
          </button>
        </div>
      ) : setup ? (
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : mfaChallenge ? (
        <MfaVerifyPanel challengeId={mfaChallenge} onAuthenticated={onAuthenticated} />
      ) : mode === "register" ? (
        <>
          <div className="panel-header">
            <h2>Create Portal account</h2>
            <p>Set up your account, then continue to {context?.client_name ?? "the connected app"}.</p>
          </div>
          <form onSubmit={submitRegister} className="form-stack">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Display name" value={displayName} onChange={setDisplayName} autoComplete="name" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy || !context || Boolean(contextError)}>
              {busy ? "Creating..." : "Create and continue"}
            </button>
          </form>
          <button className="link-button" onClick={() => setMode("login")}>
            Already have an account? Sign in
          </button>
        </>
      ) : (
        <>
          <div className="panel-header">
            <h2>Sign in with Portal</h2>
            <p>Use your {PRODUCT_NAME} account to continue.</p>
          </div>
          <form onSubmit={submitLogin} className="form-stack">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy || !context || Boolean(contextError)}>
              {busy ? "Checking..." : "Sign in and continue"}
            </button>
          </form>
          <div className="link-stack">
            <button className="link-button" onClick={() => navigateWithNext("forgot-password", next)}>
              Forgot password?
            </button>
            <button className="link-button" onClick={() => setMode("register")}>
              Need an account? Register
            </button>
          </div>
        </>
      )}
    </OAuthAuthorizeLayout>
  );
}

function ForgotPasswordPage() {
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
      setError(err instanceof ApiError ? err.message : "Password reset request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div className="panel-header">
        <h2>Reset password</h2>
        <p>Enter your email and continue with the reset link.</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Alert message={error} />
        <Alert message={message} tone="success" />
        {resetLink && (
          <div className="dev-reset-link">
            <span>Dev reset link</span>
            <button type="button" onClick={() => { window.location.href = resetLink; }}>
              {resetLink}
            </button>
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Preparing..." : "Send reset link"}
        </button>
      </form>
      <button className="link-button" onClick={() => go("login")}>
        Back to sign in
      </button>
    </AuthLayout>
  );
}

function ResetPasswordPage() {
  const token = resetToken();
  const [inspect, setInspect] = useState<ResetPasswordInspectResponse | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        if (active) setError(err instanceof ApiError ? err.message : "Could not inspect reset link.");
      } finally {
        if (active) setLoadingInspect(false);
      }
    }

    inspectToken();
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !inspect?.valid) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.completePasswordReset({
        token,
        new_password: newPassword
      });
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password reset. You can sign in now.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div className="panel-header">
        <h2>Choose a new password</h2>
        <p>Enter and confirm a new password for your {PRODUCT_NAME} account.</p>
      </div>
      {loadingInspect ? (
        <Alert message="Checking reset link..." tone="info" />
      ) : !inspect?.valid ? (
        <>
          <Alert message="This reset link is invalid, expired, or already used." />
          <button className="link-button" onClick={() => go("forgot-password")}>
            Request a new reset link
          </button>
        </>
      ) : message ? (
        <>
          <Alert message={message} tone="success" />
          <button className="primary" onClick={() => go("login")}>
            Sign in
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          <Alert message={error} />
          <button className="primary" disabled={busy}>
            {busy ? "Resetting..." : "Reset password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

// ###############################################
// Verification Screens
// ###############################################

function MfaSetupPanel({ setup, onAuthenticated }: { setup: MfaSetup; onAuthenticated: (user: User) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaSetup({ challenge_id: setup.challenge_id, code });
      if (response.user) onAuthenticated(response.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Set up extra verification</h2>
        <p>Scan the QR code or enter the setup key, then submit the current verification code.</p>
      </div>
      <div className="qr-wrap">
        <img src={setup.qr_code_data_url} alt="Verification setup QR code" />
      </div>
      <div className="setup-key">{setup.manual_entry_key}</div>
      <form onSubmit={submit} className="form-stack">
        <Field label="Verification code" value={code} onChange={setCode} autoComplete="one-time-code" />
        <Alert message={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Verifying..." : "Finish setup"}
        </button>
      </form>
    </>
  );
}

function MfaVerifyPanel({ challengeId, onAuthenticated }: { challengeId: string; onAuthenticated: (user: User) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyMfaLogin({ challenge_id: challengeId, code });
      if (response.user) onAuthenticated(response.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Enter verification code</h2>
        <p>Use the current code from your verification app.</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label="Verification code" value={code} onChange={setCode} autoComplete="one-time-code" />
        <Alert message={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Verifying..." : "Verify and continue"}
        </button>
      </form>
    </>
  );
}

// ###############################################
// Profile Onboarding
// ###############################################

function onboardingCopy(field: ProfilePromptField) {
  const copy: Record<ProfilePromptField, { title: string; label: string; helper: string; placeholder?: string; type?: string; inputMode?: "tel" | "text" }> = {
    phone_number: {
      title: "Add your phone number",
      label: "Phone number",
      helper: "This is saved to your profile. SMS verification is not required yet.",
      placeholder: "+1 555 123 4567",
      type: "tel",
      inputMode: "tel"
    },
    gender: {
      title: "Choose a gender option",
      label: "Gender",
      helper: "You can skip this or change it later from profile settings."
    },
    date_of_birth: {
      title: "Add your date of birth",
      label: "Date of birth",
      helper: "Use the date format from your browser date picker.",
      type: "date"
    },
    first_name: {
      title: "Add your first name",
      label: "First name",
      helper: "This helps apps show a more personal profile.",
      placeholder: "First name",
      type: "text",
      inputMode: "text"
    },
    last_name: {
      title: "Add your last name",
      label: "Last name",
      helper: "You can edit this later from profile settings.",
      placeholder: "Last name",
      type: "text",
      inputMode: "text"
    }
  };
  return copy[field];
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
  const field = user.profile_completion.next_prompt_field;
  const [value, setValue] = useState("");
  const [gender, setGender] = useState<GenderValue | "">("");
  const [genderCustom, setGenderCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
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

  async function saveStep(event: FormEvent) {
    event.preventDefault();
    if (!field) return;
    setBusy(true);
    setError(null);
    try {
      let payload: ProfileUpdatePayload;
      if (field === "gender") {
        if (!gender) {
          setError("Choose a gender option or skip this step.");
          return;
        }
        if (gender === "custom" && !optionalText(genderCustom)) {
          setError("Add a custom gender value or skip this step.");
          return;
        }
        payload = {
          gender,
          gender_custom: gender === "custom" ? optionalText(genderCustom) : null
        };
      } else {
        const nextValue = optionalText(value);
        if (!nextValue) {
          setError(`Enter ${onboardingCopy(field).label.toLowerCase()} or skip this step.`);
          return;
        }
        payload = { [field]: nextValue } as ProfileUpdatePayload;
      }
      await completeAndContinue(await api.updateProfile(payload));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profile update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function skipStep() {
    if (!field) return;
    setBusy(true);
    setError(null);
    try {
      await completeAndContinue(await api.skipProfileOnboarding(field));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not skip this step.");
    } finally {
      setBusy(false);
    }
  }

  async function finishWithoutPrompt() {
    setBusy(true);
    setError(null);
    try {
      await completeAndContinue(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete profile setup.");
    } finally {
      setBusy(false);
    }
  }

  if (!field) {
    return (
      <AuthLayout>
        <div className="panel-header">
          <h2>Profile setup is ready</h2>
          <p>Your profile steps are complete. Continue to your account.</p>
        </div>
        <Alert message={error} />
        <button className="primary" onClick={finishWithoutPrompt} disabled={busy}>
          {busy ? "Finishing..." : "Continue"}
        </button>
      </AuthLayout>
    );
  }

  const copy = onboardingCopy(field);

  return (
    <AuthLayout>
      <div className="panel-header">
        <h2>{copy.title}</h2>
        <p>{copy.helper}</p>
      </div>
      <div className="onboarding-progress">
        Next profile detail: {humanize(field)}
      </div>
      <form onSubmit={saveStep} className="form-stack">
        {field === "gender" ? (
          <>
            <SelectField<GenderValue>
              label={copy.label}
              value={gender}
              onChange={setGender}
              options={GENDER_OPTIONS}
            />
            {gender === "custom" && (
              <Field
                label="Custom gender"
                value={genderCustom}
                onChange={setGenderCustom}
                placeholder="How you want this shown"
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
        <div className="button-row">
          <button className="primary" disabled={busy}>
            {busy ? "Saving..." : "Save and continue"}
          </button>
          <button type="button" className="secondary" onClick={skipStep} disabled={busy}>
            Skip
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

// ###############################################
// Account Screens
// ###############################################

function AccountHomePage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const [query, setQuery] = useState("");
  const [pictureModalOpen, setPictureModalOpen] = useState(false);
  const pictureModalPresence = useMotionPresence(pictureModalOpen, MOTION_BASE_MS);

  function search(event: FormEvent) {
    event.preventDefault();
    go(routeForSearch(query));
  }

  return (
    <section className="account-home">
      <div className="home-identity">
        <button className="home-avatar-wrap" aria-label="Change profile picture" onClick={() => setPictureModalOpen(true)}>
          <Avatar user={user} />
          <span aria-hidden="true">
            <CameraIcon />
          </span>
        </button>
        <h1>{user.display_name}</h1>
        <p>{user.email}</p>
      </div>

      <form className="home-search" onSubmit={search}>
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${PRODUCT_NAME}`}
          aria-label={`Search ${PRODUCT_NAME}`}
        />
      </form>

      <div className="quick-actions" aria-label="Quick account actions">
        <button onClick={() => go("profile")}>Profile</button>
        <button onClick={() => go("security")}>Password</button>
        <button onClick={() => go("security")}>Devices</button>
        <button onClick={() => go("security")}>Verification</button>
      </div>

      <p className="home-privacy-note">
        Only you can see your settings. Review your profile details, password, devices, and sign-in protection from this account center.
      </p>

      {pictureModalPresence.mounted && (
        <div
          className="picture-modal-overlay"
          data-state={pictureModalPresence.state}
          role="dialog"
          aria-modal="true"
          aria-label="Change profile picture"
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
  return (
    <SettingsPage title="Personal info">
      <div className="settings-group">
        <SettingsRow
          icon="camera"
          title="Profile picture"
          right={<Avatar user={user} />}
          onClick={() => goProfileEdit("picture")}
        />
        <SettingsRow icon="id" title="Name" value={fullName(user)} onClick={() => goProfileEdit("name")} />
        <SettingsRow
          icon="user"
          title="Gender"
          value={user.gender === "custom" ? displayValue(user.gender_custom) : genderLabel(user.gender)}
          onClick={() => goProfileEdit("gender")}
        />
        <SettingsRow icon="mail" title="Email" value={user.email} />
        <SettingsRow
          icon="phone"
          title="Phone"
          value={user.phone_number ? `${user.phone_number}${user.phone_verified ? " · Verified" : " · Not verified"}` : "Not added"}
          onClick={() => goProfileEdit("phone")}
        />
        <SettingsRow icon="cake" title="Birthday" value={displayValue(user.date_of_birth)} onClick={() => goProfileEdit("birthday")} />
        <SettingsRow icon="globe" title="Language" value={primaryLanguage(user)} onClick={() => goProfileEdit("language")} />
        <SettingsRow icon="clock" title="Timezone" value={displayValue(user.timezone)} onClick={() => goProfileEdit("timezone")} />
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
  const [displayName, setDisplayName] = useState(user.display_name);
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number ?? "");
  const [gender, setGender] = useState<GenderValue | "">(user.gender ?? "");
  const [genderCustom, setGenderCustom] = useState(user.gender_custom ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.date_of_birth ?? "");
  const [locale, setLocale] = useState(user.locale ?? "");
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
          locale: optionalText(locale)
        };
      } else {
        payload = {
          display_name: user.display_name,
          timezone: optionalText(timezone)
        };
      }

      const updated = await api.updateProfile(payload);
      setUser(updated);
      go("profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profile update failed.");
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
      label: "Account name",
      description: `Your name is shown in ${PRODUCT_NAME} and apps that use this account.`
    },
    gender: {
      label: "Personal detail",
      description: "Choose the gender value you want saved with your profile."
    },
    phone: {
      label: user.phone_verified ? "Phone verified" : "Phone not verified",
      description: "Phone numbers are saved to your profile. Text message verification is not available yet."
    },
    birthday: {
      label: "Birthday",
      description: "Your date of birth is optional and can be changed from this page."
    },
    language: {
      label: "Language",
      description: "Set the locale you prefer for account experiences that support it."
    },
    timezone: {
      label: "Timezone",
      description: "Set the timezone used for account activity and time-based details."
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
              <Field label="Display name" value={displayName} onChange={setDisplayName} required />
            </div>
            <Field label="First name" value={firstName} onChange={setFirstName} />
            <Field label="Last name" value={lastName} onChange={setLastName} />
          </div>
        )}
        {field === "gender" && (
          <>
            <SelectField<GenderValue>
              label="Gender"
              value={gender}
              onChange={setGender}
              options={GENDER_OPTIONS}
              placeholder="Not set"
            />
            {gender === "custom" && <Field label="Custom gender" value={genderCustom} onChange={setGenderCustom} />}
          </>
        )}
        {field === "phone" && (
          <>
            <Field label="Phone number" type="tel" inputMode="tel" value={phoneNumber} onChange={setPhoneNumber} placeholder="+1 555 123 4567" />
            <div className="field-help">Phone numbers are saved only. SMS verification is not enabled yet.</div>
          </>
        )}
        {field === "birthday" && (
          <Field label="Date of birth" type="date" value={dateOfBirth} onChange={setDateOfBirth} />
        )}
        {field === "language" && (
          <Field label="Language / locale" value={locale} onChange={setLocale} placeholder="en-US" />
        )}
        {field === "timezone" && (
          <Field label="Timezone" value={timezone} onChange={setTimezone} placeholder="Asia/Kuala_Lumpur" />
        )}
      </div>
      <Alert message={error} />
      <div className="button-row profile-edit-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" className="secondary" onClick={() => go("profile")} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SecurityPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
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
  const [expandedSection, setExpandedSection] = useState<"activity" | "password" | "verification" | "sessions" | null>(null);
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
      setSecurityError(err instanceof ApiError ? err.message : "Could not load security activity.");
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSecurityData();
  }, [refreshSecurityData]);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed.");
      void refreshSecurityData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed.");
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
      setMessage("Extra verification disabled.");
      void refreshSecurityData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not turn off extra verification.");
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
      setError(err instanceof ApiError ? err.message : "Could not start verification setup.");
    } finally {
      setBusy(false);
    }
  }

  const onMfaEnabled = (updated: User) => {
    setUser(updated);
    setSetup(null);
    setMessage("Extra verification enabled.");
    void refreshSecurityData();
  };

  async function revokeSession(session: SessionInfo) {
    setSecurityAction(session.id);
    setSecurityError(null);
    setMessage(null);
    try {
      await api.revokeSession(session.id);
      setMessage("Session signed out.");
      await refreshSecurityData();
    } catch (err) {
      setSecurityError(err instanceof ApiError ? err.message : "Could not sign out this session.");
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
      setMessage("Other devices signed out.");
      await refreshSecurityData();
    } catch (err) {
      setSecurityError(err instanceof ApiError ? err.message : "Could not sign out other devices.");
    } finally {
      setSecurityAction(null);
    }
  }

  return (
    <SettingsPage title="Security and sign-in">
      <button className="settings-tip-card" onClick={() => setExpandedSection("verification")}>
        <span className="tip-icon">
          <SettingIcon name="shield" />
        </span>
        <span>
          <strong>{user.mfa_enabled ? "Your account has extra protection" : "Add extra sign-in protection"}</strong>
          <span>{user.mfa_enabled ? "A verification code is required when this account signs in." : "Turn on verification to add another check when signing in."}</span>
        </span>
      </button>

      <div className="settings-section">
        <h2>Recent security activity</h2>
        <p>{securityLoading ? "Loading recent activity..." : latestSecurityEvent(events)}</p>
        <div className="settings-group">
          <SettingsRow
            icon="activity"
            title="Security activity"
            value={events.length === 0 ? "No security activity or alerts in the last 28 days" : `${events.length} recent events`}
            onClick={() => setExpandedSection(expandedSection === "activity" ? null : "activity")}
          />
          <MotionPanel open={expandedSection === "activity"}>
              <Alert message={securityError} />
              {securityLoading ? (
                <Alert message="Loading activity..." tone="info" />
              ) : events.length === 0 ? (
                <div className="empty-inline">No security activity found.</div>
              ) : (
                <div className="record-list">
                  {events.map((event) => (
                    <div className="record-item event-item" key={event.id}>
                      <div>
                        <div className="record-title">
                          <strong>{humanize(event.event_type)}</strong>
                          <span>{formatDateTime(event.created_at)}</span>
                        </div>
                        <p>{displayValue(event.device_label, "Unknown device")}</p>
                        <div className="record-meta">
                          <span>IP: {displayValue(event.ip_address)}</span>
                          <span>User agent: {displayValue(event.user_agent)}</span>
                        </div>
                        <div className="metadata-line">{metadataSummary(event.metadata)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </MotionPanel>
        </div>
      </div>

      <div className="settings-section">
        <h2>How you sign in</h2>
        <p>Keep these settings up to date so you can always access your account.</p>
        <div className="settings-group">
          <SettingsRow
            icon="shield"
            title="Extra verification"
            value={user.mfa_enabled ? "On" : "Off"}
            onClick={() => setExpandedSection(expandedSection === "verification" ? null : "verification")}
          />
          <MotionPanel open={expandedSection === "verification"}>
              {setup ? (
                <MfaSetupPanel setup={setup} onAuthenticated={onMfaEnabled} />
              ) : user.mfa_enabled ? (
                <form className="form-stack" onSubmit={disableMfa}>
                  <Field label="Current password" type="password" value={mfaPassword} onChange={setMfaPassword} />
                  <Field label="Verification code" value={mfaCode} onChange={setMfaCode} />
                  <button className="secondary" disabled={busy}>
                    Turn off extra verification
                  </button>
                </form>
              ) : (
                <button className="primary" onClick={enableMfa} disabled={busy}>
                  Turn on extra verification
                </button>
              )}
              <Alert message={error} />
              <Alert message={message} tone="success" />
          </MotionPanel>

          <SettingsRow
            icon="key"
            title="Password"
            value="Change your account password"
            onClick={() => setExpandedSection(expandedSection === "password" ? null : "password")}
          />
          <MotionPanel open={expandedSection === "password"}>
              <form className="form-stack" onSubmit={changePassword}>
                <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
                <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
                <button className="primary" disabled={busy}>
                  Change password
                </button>
              </form>
              <Alert message={error} />
              <Alert message={message} tone="success" />
          </MotionPanel>

          <SettingsRow
            icon="devices"
            title="Active sessions"
            value={securityLoading ? "Loading sessions..." : `${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}`}
            onClick={() => setExpandedSection(expandedSection === "sessions" ? null : "sessions")}
          />
          <MotionPanel open={expandedSection === "sessions"}>
              <div className="split-header compact-header">
                <div>
                  <h3>Devices signed in</h3>
                  <p>Review the devices currently signed in to your account.</p>
                </div>
                <button className="secondary" onClick={logoutOtherSessions} disabled={securityAction !== null || sessions.length <= 1}>
                  {securityAction === "logout-others" ? "Signing out..." : "Sign out other devices"}
                </button>
              </div>
              <Alert message={securityError} />
              {securityLoading ? (
                <Alert message="Loading sessions..." tone="info" />
              ) : sessions.length === 0 ? (
                <div className="empty-inline">No active sessions found.</div>
              ) : (
                <div className="record-list">
                  {sessions.map((session) => (
                    <div className="record-item" key={session.id}>
                      <div>
                        <div className="record-title">
                          <strong>{displayValue(session.device_label, "Unknown device")}</strong>
                          {session.is_current && <span className="current-badge">Current</span>}
                        </div>
                        <p>{displayValue(session.user_agent, "No user agent")}</p>
                        <div className="record-meta">
                          <span>Login IP: {displayValue(session.login_ip_address)}</span>
                          <span>Last IP: {displayValue(session.last_seen_ip_address)}</span>
                          <span>Last seen: {formatDateTime(session.last_seen_at)}</span>
                          <span>Expires: {formatDateTime(session.expires_at)}</span>
                        </div>
                      </div>
                      {!session.is_current && (
                        <button className="secondary" onClick={() => revokeSession(session)} disabled={securityAction !== null}>
                          {securityAction === session.id ? "Signing out..." : "Sign out"}
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
  const { user, setUser, loading } = useSession();

  useEffect(() => {
    const updateRoute = () => setRoute(getRoute());
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  const finishOnboarding = useCallback(() => {
    if (pendingRedirect) {
      window.location.href = pendingRedirect;
      return;
    }
    go("account");
  }, [pendingRedirect]);

  const onAuthenticated = useCallback((nextUser: User, options?: { showOnboarding?: boolean }) => {
    setUser(nextUser);
    const redirect = nextUrl();
    setPendingRedirect(redirect);
    if (options?.showOnboarding && nextUser.profile_completion.next_prompt_field) {
      go("profile-onboarding");
      return;
    }
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

  if (route === "register") return <RegisterPage onAuthenticated={onAuthenticated} />;
  if (route === "login") return <LoginPage onAuthenticated={onAuthenticated} />;
  if (route === "authorize") return <OAuthAuthorizePage user={user} loading={loading} onAuthenticated={onAuthenticated} />;
  if (route === "forgot-password") return <ForgotPasswordPage />;
  if (route === "reset-password") return <ResetPasswordPage />;
  if (route === "profile-onboarding" && user) {
    return <ProfileOnboardingPage user={user} setUser={setUser} onFinished={finishOnboarding} />;
  }
  if (loading || !user) return <StandaloneAccessState loading={loading} />;
  if (route === "profile-edit") {
    const field = profileEditField();
    return (
      <ProfileEditDetailShell user={user} setUser={setUser} title={profileEditTitle(field)} onLogout={onLogout}>
        <ProfileEditPage user={user} setUser={setUser} field={field} />
      </ProfileEditDetailShell>
    );
  }
  if (!protectedPage) return <StandaloneAccessState loading={loading} />;

  const activeConsoleRoute = route as ConsoleRoute;

  return (
    <Shell user={user} setUser={setUser} route={activeConsoleRoute} onLogout={onLogout}>
      {protectedPage}
    </Shell>
  );
}
