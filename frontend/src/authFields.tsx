/*
Created at: 2026-10-11 02:26
Updated at: 2026-10-11 02:26
Description: Shared helpers for the GozilaSim ID sign-in, sign-up, password reset, and verification screens: validation, error mapping, the code field, and the password strength meter.
*/

// ###############################################
// Imports
// ###############################################

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import type { TranslationKey } from "./i18n";

// ###############################################
// Types And Constants
// ###############################################

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export const PASSWORD_MIN_LENGTH = 8;
export const MFA_CODE_LENGTH = 6;
export const RESET_RESEND_COOLDOWN_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Backend `detail` strings that have a translated, friendlier equivalent.
const AUTH_ERROR_KEYS: Record<string, TranslationKey> = {
  "Invalid email or password.": "login.invalidCredentials",
  "Email is already registered.": "register.emailTaken",
  "Invalid MFA code.": "mfa.invalidCode",
  "MFA code is required.": "reset.mfaRequired",
  "Invalid or expired reset token.": "reset.invalid"
};

// ###############################################
// Validation
// ###############################################

export function emailError(value: string, t: Translate) {
  const email = value.trim();
  if (!email) return t("validation.emailRequired");
  if (!EMAIL_PATTERN.test(email)) return t("validation.emailInvalid");
  return null;
}

export function newPasswordError(value: string, t: Translate) {
  if (!value) return t("validation.passwordRequired");
  if (value.length < PASSWORD_MIN_LENGTH) return t("validation.passwordTooShort", { count: PASSWORD_MIN_LENGTH });
  return null;
}

export function useFieldErrors<Key extends string>() {
  const [errors, setErrors] = useState<Partial<Record<Key, string | null>>>({});

  const clearError = useCallback((key: Key) => {
    setErrors((current) => (current[key] ? { ...current, [key]: null } : current));
  }, []);

  return { errors, setErrors, clearError };
}

export function hasFieldErrors(errors: Partial<Record<string, string | null>>) {
  return Object.values(errors).some(Boolean);
}

export function focusFirstInvalid(form: HTMLFormElement) {
  // Wait for the render that marks the fields invalid.
  window.requestAnimationFrame(() => {
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

// ###############################################
// Server Errors
// ###############################################

export function authErrorMessage(err: unknown, t: Translate, fallback: TranslationKey) {
  if (err instanceof ApiError) {
    const key = AUTH_ERROR_KEYS[err.message];
    return key ? t(key) : err.message || t(fallback);
  }
  // fetch rejects with a TypeError when the server cannot be reached.
  if (err instanceof TypeError) return t("common.networkError");
  return err instanceof Error && err.message ? err.message : t(fallback);
}

export function isEmailTaken(err: unknown) {
  return err instanceof ApiError && err.status === 409;
}

// The verify endpoints answer 400 only when the challenge itself can no longer be used.
export function isChallengeGone(err: unknown) {
  return err instanceof ApiError && err.status === 400;
}

// ###############################################
// Navigation Helpers
// ###############################################

// Email typed on one auth screen, carried to the next without putting it in the URL.
let authEmailDraft = "";

export function getAuthEmailDraft() {
  return authEmailDraft;
}

export function setAuthEmailDraft(email: string) {
  authEmailDraft = email.trim();
}

// Autofocus on load only where it will not pop a touch keyboard over the form.
export function prefersFinePointer() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

// ###############################################
// Formatting
// ###############################################

export function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function groupSetupKey(key: string) {
  return key.replace(/(.{4})/g, "$1 ").trim();
}

export function passwordScore(password: string) {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN_LENGTH) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  return Math.min(4, 2 + (password.length >= 12 ? 1 : 0) + (kinds >= 3 ? 1 : 0));
}

// ###############################################
// Hooks
// ###############################################

export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timeout = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [secondsLeft]);

  return [secondsLeft, setSecondsLeft] as const;
}

// Keeps the outer box at the inner content's height so CSS can transition between steps.
export function useAnimatedHeight<Outer extends HTMLElement, Inner extends HTMLElement>() {
  const outerRef = useRef<Outer>(null);
  const innerRef = useRef<Inner>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const style = window.getComputedStyle(outer);
      const chrome =
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth);
      outer.style.height = `${inner.offsetHeight + chrome}px`;
    });
    observer.observe(inner);

    return () => {
      observer.disconnect();
      outer.style.height = "";
    };
  }, []);

  return { outerRef, innerRef };
}

// ###############################################
// Icons
// ###############################################

export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function PhoneAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="7" y="3.5" width="10" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

// ###############################################
// Code Field
// ###############################################

export function CodeField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string | null;
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const activeIndex = Math.min(props.value.length, MFA_CODE_LENGTH - 1);

  function update(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, MFA_CODE_LENGTH);
    if (next === props.value) return;
    props.onChange(next);
    if (next.length === MFA_CODE_LENGTH) props.onComplete?.(next);
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {props.label}
      </label>
      <div className="code-field">
        {/* One real input sits invisibly over the cells, so paste and one-time-code autofill work natively. */}
        <input
          id={inputId}
          className="code-field-input"
          value={props.value}
          onChange={(event) => update(event.target.value)}
          // Typing always continues at the end, so the highlighted cell is the one that fills next.
          onSelect={(event) => {
            const input = event.currentTarget;
            const end = input.value.length;
            if (input.selectionStart !== end || input.selectionEnd !== end) input.setSelectionRange(end, end);
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus={props.autoFocus}
          readOnly={props.readOnly}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? errorId : undefined}
        />
        <div className="code-field-cells" aria-hidden="true">
          {Array.from({ length: MFA_CODE_LENGTH }, (_, index) => (
            <div key={index} className="code-field-cell" data-active={index === activeIndex}>
              {props.value[index] ?? ""}
            </div>
          ))}
        </div>
      </div>
      {props.error && (
        <p className="field-error" id={errorId} role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

// ###############################################
// Password Strength
// ###############################################

export function PasswordStrength({ password, t }: { password: string; t: Translate }) {
  const score = passwordScore(password);
  const levelKeys: TranslationKey[] = ["password.fair", "password.good", "password.strong"];
  const label =
    score === 0
      ? t("password.hint", { count: PASSWORD_MIN_LENGTH })
      : score === 1
        ? t("password.moreToGo", { count: PASSWORD_MIN_LENGTH, remaining: PASSWORD_MIN_LENGTH - password.length })
        : t("password.strength", { level: t(levelKeys[score - 2]) });

  return (
    <div className="password-strength" data-score={score}>
      <div className="password-strength-bar" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} data-on={step <= score} />
        ))}
      </div>
      <p className="field-help" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
