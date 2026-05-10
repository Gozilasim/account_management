/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-11 01:17
Description: Shared frontend TypeScript types for Portal API responses.
*/

export type User = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  mfa_enabled: boolean;
  mfa_enrolled: boolean;
  email_verified: boolean;
};

export type MfaSetup = {
  challenge_id: string;
  otpauth_uri: string;
  qr_code_data_url: string;
  manual_entry_key: string;
};

export type LoginResponse = {
  user?: User | null;
  mfa_required: boolean;
  mfa_setup_required: boolean;
  challenge_id?: string | null;
  mfa_setup?: MfaSetup | null;
};
