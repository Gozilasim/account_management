/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-13 23:34
Description: Frontend API client for GozilaSim ID backend endpoints.
*/

// ###############################################
// Imports
// ###############################################

import type {
  AuthorizeContext,
  AvatarHistoryItem,
  ForgotPasswordResponse,
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
// Client Setup
// ###############################################

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ###############################################
// Request Helper
// ###############################################

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    credentials: "include"
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (Array.isArray(payload.detail)) {
        message = payload.detail
          .map((item: { msg?: string }) => item.msg)
          .filter(Boolean)
          .join(" ") || message;
      } else if (payload.detail) {
        message = JSON.stringify(payload.detail);
      }
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ###############################################
// Endpoint Methods
// ###############################################

export const api = {
  me: () => request<User>("/api/auth/me"),
  authorizeContext: (payload: { client_id: string; redirect_uri: string; scope: string }) => {
    const params = new URLSearchParams(payload);
    return request<AuthorizeContext>(`/oauth/authorize/context?${params.toString()}`);
  },
  register: (payload: { email: string; password: string; display_name: string }) =>
    request<{ mfa_setup_required: boolean; mfa_setup: MfaSetup; user: User }>("/api/auth/register", {
      method: "POST",
      body: payload
    }),
  login: (payload: { email: string; password: string }) =>
    request<LoginResponse>("/api/auth/login", { method: "POST", body: payload }),
  verifyMfaLogin: (payload: { challenge_id: string; code: string }) =>
    request<LoginResponse>("/api/auth/mfa/login/verify", { method: "POST", body: payload }),
  verifyMfaSetup: (payload: { challenge_id: string; code: string }) =>
    request<LoginResponse>("/api/auth/mfa/setup/verify", { method: "POST", body: payload }),
  startMfaSetup: () => request<MfaSetup>("/api/auth/mfa/setup", { method: "POST" }),
  disableMfa: (payload: { current_password: string; code: string }) =>
    request<User>("/api/auth/mfa/disable", { method: "POST", body: payload }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<{ message: string }>("/api/auth/password/change", { method: "POST", body: payload }),
  forgotPassword: (payload: { email: string }) =>
    request<ForgotPasswordResponse>("/api/auth/password/forgot", { method: "POST", body: payload }),
  inspectPasswordReset: (payload: { token: string }) =>
    request<ResetPasswordInspectResponse>("/api/auth/password/reset/inspect", { method: "POST", body: payload }),
  completePasswordReset: (payload: { token: string; new_password: string; mfa_code?: string }) =>
    request<{ message: string }>("/api/auth/password/reset/complete", { method: "POST", body: payload }),
  updateProfile: (payload: ProfileUpdatePayload) =>
    request<User>("/api/profile", { method: "PATCH", body: payload }),
  skipProfileOnboarding: (field: ProfilePromptField) =>
    request<User>("/api/profile/onboarding/skip", { method: "POST", body: { field } }),
  completeProfileOnboarding: () =>
    request<User>("/api/profile/onboarding/complete", { method: "POST" }),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.set("avatar", file);
    return request<User>("/api/profile/avatar", { method: "POST", formData });
  },
  listAvatarHistory: () => request<AvatarHistoryItem[]>("/api/profile/avatar/history"),
  restoreAvatar: (publicId: string) =>
    request<User>("/api/profile/avatar/restore", { method: "POST", body: { public_id: publicId } }),
  deleteAvatarHistoryItem: (publicId: string) =>
    request<{ message: string }>(`/api/profile/avatar/history/${encodeURIComponent(publicId)}`, { method: "DELETE" }),
  listSessions: () => request<SessionInfo[]>("/api/auth/sessions"),
  revokeSession: (sessionId: string) =>
    request<{ message: string }>(`/api/auth/sessions/${sessionId}`, { method: "DELETE" }),
  logoutOtherSessions: () =>
    request<{ message: string }>("/api/auth/sessions/logout-others", { method: "POST" }),
  listSecurityEvents: () => request<SecurityEvent[]>("/api/auth/security-events"),
  logout: () => request<{ message: string }>("/api/auth/sessions/logout", { method: "POST" })
};
