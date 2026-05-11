/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-12 02:17
Description: Shared frontend TypeScript types for GozilaSim ID API responses.
*/

// ###############################################
// Account Types
// ###############################################

export type ProfilePromptField = "phone_number" | "gender" | "date_of_birth" | "first_name" | "last_name";

export type GenderValue = "male" | "female" | "non_binary" | "prefer_not_to_say" | "custom";

export type ProfileCompletion = {
  onboarding_completed: boolean;
  missing_fields: ProfilePromptField[];
  skipped_fields: ProfilePromptField[];
  next_prompt_field: ProfilePromptField | null;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  gender: GenderValue | null;
  gender_custom: string | null;
  date_of_birth: string | null;
  locale: string | null;
  timezone: string | null;
  avatar_url: string | null;
  avatar_history: AvatarHistoryItem[];
  mfa_enabled: boolean;
  mfa_enrolled: boolean;
  email_verified: boolean;
  profile_completion: ProfileCompletion;
};

export type AvatarHistoryItem = {
  public_id: string;
  url: string;
  uploaded_at: string;
  replaced_at: string;
};

export type MfaSetup = {
  challenge_id: string;
  otpauth_uri: string;
  qr_code_data_url: string;
  manual_entry_key: string;
};

// ###############################################
// Auth Response Types
// ###############################################

export type LoginResponse = {
  user?: User | null;
  mfa_required: boolean;
  mfa_setup_required: boolean;
  challenge_id?: string | null;
  mfa_setup?: MfaSetup | null;
};

export type ForgotPasswordResponse = {
  message: string;
  reset_link?: string | null;
};

export type ResetPasswordInspectResponse = {
  valid: boolean;
  mfa_required: boolean;
};

export type AuthorizeContext = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  scope: string;
  scopes: string[];
};

// ###############################################
// Profile Request Types
// ###############################################

export type ProfileUpdatePayload = {
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  gender?: GenderValue | null;
  gender_custom?: string | null;
  date_of_birth?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

// ###############################################
// Session And Security Types
// ###############################################

export type SessionInfo = {
  id: string;
  device_label: string | null;
  login_ip_address: string | null;
  last_seen_ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
};

export type SecurityEvent = {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  device_label: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};
