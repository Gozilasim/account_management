/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-11 01:17
Description: Main Portal React UI for auth, MFA, profile, and security screens.
*/

// ###############################################
// Imports
// ###############################################

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import type { LoginResponse, MfaSetup, User } from "./types";

// ###############################################
// Routing Helpers
// ###############################################

type Route = "login" | "register" | "account" | "security";

function getRoute(): Route {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path === "register" || path === "security" || path === "account") return path;
  return "login";
}

function go(path: Route) {
  window.history.pushState({}, "", `/${path}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function nextUrl() {
  return new URLSearchParams(window.location.search).get("next");
}

function userInitials(user: User | null) {
  if (!user) return "MP";
  return user.display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || user.email[0].toUpperCase();
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
      />
    </label>
  );
}

function Alert({ message, tone = "danger" }: { message: string | null; tone?: "danger" | "success" | "info" }) {
  if (!message) return null;
  return <div className={`alert alert-${tone}`}>{message}</div>;
}

function Shell({
  user,
  children,
  onLogout
}: {
  user: User | null;
  children: ReactNode;
  onLogout: () => void;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go(user ? "account" : "login")}>
          <span className="brand-mark">MP</span>
          <span>My Portal</span>
        </button>
        <nav>
          <button onClick={() => go("account")} disabled={!user}>
            Account
          </button>
          <button onClick={() => go("security")} disabled={!user}>
            Security
          </button>
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="mini-user">
                <Avatar user={user} />
                <div>
                  <strong>{user.display_name}</strong>
                  <span>{user.email}</span>
                </div>
              </div>
              <button className="secondary full" onClick={onLogout}>
                Sign out
              </button>
            </>
          ) : (
            <div className="muted">One account for every project.</div>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
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
    <section className="auth-layout">
      <div className="auth-copy">
        <h1>One login for every product.</h1>
        <p>Register once, secure the account with MFA, and let your other projects use Login via My Portal.</p>
        <div className="auth-points">
          <span>OIDC ready</span>
          <span>Authenticator MFA</span>
          <span>Cloudinary avatars</span>
        </div>
      </div>
      <div className="panel auth-panel">{children}</div>
    </section>
  );
}

// ###############################################
// Authentication Screens
// ###############################################

function RegisterPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
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
        <MfaSetupPanel setup={setup} onAuthenticated={onAuthenticated} />
      ) : (
        <>
          <div className="panel-header">
            <h2>Create Portal account</h2>
            <p>New accounts must link an authenticator app before login is complete.</p>
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

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
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
            <h2>Sign in to Portal</h2>
            <p>MFA is required whenever your account has it enabled.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <Alert message={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Checking..." : "Sign in"}
            </button>
          </form>
          <button className="link-button" onClick={() => go("register")}>
            Need an account? Register
          </button>
        </>
      )}
    </AuthLayout>
  );
}

// ###############################################
// MFA Screens
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
      setError(err instanceof ApiError ? err.message : "MFA setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Link authenticator</h2>
        <p>Scan the QR code or enter the setup key, then submit the current code.</p>
      </div>
      <div className="qr-wrap">
        <img src={setup.qr_code_data_url} alt="Authenticator setup QR code" />
      </div>
      <div className="setup-key">{setup.manual_entry_key}</div>
      <form onSubmit={submit} className="form-stack">
        <Field label="Authenticator code" value={code} onChange={setCode} autoComplete="one-time-code" />
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
      setError(err instanceof ApiError ? err.message : "MFA verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Enter MFA code</h2>
        <p>Use the current code from your authenticator app.</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field label="Authenticator code" value={code} onChange={setCode} autoComplete="one-time-code" />
        <Alert message={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Verifying..." : "Verify and continue"}
        </button>
      </form>
    </>
  );
}

// ###############################################
// Account Screens
// ###############################################

function RequireUser({ user, loading, children }: { user: User | null; loading: boolean; children: ReactNode }) {
  if (loading) return <div className="panel">Loading account...</div>;
  if (!user) {
    return (
      <div className="panel empty-state">
        <h2>Sign in required</h2>
        <p>You need a Portal session to view this page.</p>
        <button className="primary" onClick={() => go("login")}>
          Sign in
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

function AccountPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(user.display_name);
  }, [user.display_name]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateProfile({ display_name: displayName });
      setUser(updated);
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profile update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.uploadAvatar(file);
      setUser(updated);
      setSuccess("Avatar uploaded.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Avatar upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-grid">
      <div className="panel profile-panel">
        <div className="profile-heading">
          <Avatar user={user} />
          <div>
            <h1>{user.display_name}</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="status-row">
          <span>MFA {user.mfa_enabled ? "enabled" : "disabled"}</span>
          <span>{user.email_verified ? "Email verified" : "Email not verified"}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Account profile</h2>
          <p>This profile is returned to connected apps through OIDC claims.</p>
        </div>
        <form className="form-stack" onSubmit={saveProfile}>
          <Field label="Display name" value={displayName} onChange={setDisplayName} />
          <label className="field">
            <span>Avatar</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
          </label>
          <Alert message={error} />
          <Alert message={success} tone="success" />
          <button className="primary" disabled={busy}>
            {busy ? "Saving..." : "Save profile"}
          </button>
        </form>
      </div>
    </section>
  );
}

function SecurityPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setMessage("MFA disabled.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disable MFA.");
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
      setError(err instanceof ApiError ? err.message : "Could not start MFA setup.");
    } finally {
      setBusy(false);
    }
  }

  const onMfaEnabled = (updated: User) => {
    setUser(updated);
    setSetup(null);
    setMessage("MFA enabled.");
  };

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Password</h2>
          <p>Change the password for your Portal account.</p>
        </div>
        <form className="form-stack" onSubmit={changePassword}>
          <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
          <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
          <button className="primary" disabled={busy}>
            Change password
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Multi-factor authentication</h2>
          <p>{user.mfa_enabled ? "Authenticator MFA is required for Portal and OIDC login." : "MFA is currently disabled for this account."}</p>
        </div>
        {setup ? (
          <MfaSetupPanel setup={setup} onAuthenticated={onMfaEnabled} />
        ) : user.mfa_enabled ? (
          <form className="form-stack" onSubmit={disableMfa}>
            <Field label="Current password" type="password" value={mfaPassword} onChange={setMfaPassword} />
            <Field label="Authenticator code" value={mfaCode} onChange={setMfaCode} />
            <button className="secondary" disabled={busy}>
              Disable MFA
            </button>
          </form>
        ) : (
          <button className="primary" onClick={enableMfa} disabled={busy}>
            Enable MFA
          </button>
        )}
        <Alert message={error} />
        <Alert message={message} tone="success" />
      </div>
    </section>
  );
}

// ###############################################
// App Composition
// ###############################################

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  const { user, setUser, loading } = useSession();

  useEffect(() => {
    const updateRoute = () => setRoute(getRoute());
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  const onAuthenticated = useCallback((nextUser: User) => {
    setUser(nextUser);
    const redirect = nextUrl();
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

  const page = useMemo(() => {
    if (route === "register") return <RegisterPage onAuthenticated={onAuthenticated} />;
    if (route === "security") {
      return (
        <RequireUser user={user} loading={loading}>
          {user && <SecurityPage user={user} setUser={setUser} />}
        </RequireUser>
      );
    }
    if (route === "account") {
      return (
        <RequireUser user={user} loading={loading}>
          {user && <AccountPage user={user} setUser={setUser} />}
        </RequireUser>
      );
    }
    return <LoginPage onAuthenticated={onAuthenticated} />;
  }, [loading, onAuthenticated, route, setUser, user]);

  return (
    <Shell user={user} onLogout={onLogout}>
      {page}
    </Shell>
  );
}
