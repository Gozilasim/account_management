<!--
Created at: 2026-05-11 01:17
Updated at: 2026-10-11 12:38
Description: Setup and usage guide for the unified account Portal and app launcher.
-->

# Account Management Portal

Version 1 of the unified account portal: users register once, then other projects can sign in with the same account through `Login via Portal`.

## Directory

- `backend/`: FastAPI + SQLite local database + OIDC Provider + MFA + Cloudinary avatar upload
- `frontend/`: React + Vite Portal UI

## Local Development

1. Create the backend `.env` file at the project root:

```powershell
copy .env.example .env
```

2. Start the backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
python -m app.scripts.dev
```

3. Start the frontend:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- OIDC discovery: `http://localhost:8000/.well-known/openid-configuration`

## Docker Backend

The backend can run with Docker. By default, it uses SQLite and mounts the database at `data/portal.db` in the project root:

```powershell
docker compose up --build
```

Each time the container starts, `backend/docker-entrypoint.sh` runs:

```powershell
python -m alembic upgrade head
```

FastAPI starts only after migrations finish. Inside Docker, the default SQLite path is `sqlite:////app/data/portal.db`, which maps to `data/portal.db` in the local project root.

## Port Configuration

The backend `.env` file lives at the project root. The frontend `.env` file lives inside `frontend/`.

Project root `.env`:

```env
DATABASE_URL=sqlite:///./data/portal.db
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
FRONTEND_PORT=5173
PASSWORD_RESET_DELIVERY=dev_log
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
TRUST_PROXY_HEADERS=false
```

`frontend/.env`：

```env
FRONTEND_HOST=127.0.0.1
FRONTEND_PORT=5173
VITE_API_BASE_URL=http://localhost:8000
```

If you change `BACKEND_PORT` in the project root `.env` to something like `8010`, also update `VITE_API_BASE_URL` in `frontend/.env` to `http://localhost:8010`. For production or custom domains, set `BACKEND_URL` and `FRONTEND_URL` explicitly.

## Cloudinary

Cloudinary secrets are configured only in the project root `.env`:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

The frontend never receives Cloudinary secrets. Avatars are uploaded from the frontend to the backend, then the backend validates and uploads them to Cloudinary.

## Forgot Password

Forgot password requests generate a single-use reset token. `PASSWORD_RESET_DELIVERY` decides how the link reaches the user:

- `email`: the link is emailed through the SMTP server described in [Email](#email). Use this for any deployed site.
- `dev_log`: the link is only written to the backend log. It is also returned in the API response, but only when the frontend is served from `localhost`, so a deployed site never hands a reset link to whoever asked for it.

If `email` is selected but SMTP is not configured, the backend logs a warning and falls back to logging the link.

Each email address and each IP address can request at most `AUTH_MAX_FAILED_ATTEMPTS` reset links per `AUTH_LOCKOUT_MINUTES` minutes.

Flow:

```text
POST /api/auth/password/forgot
POST /api/auth/password/reset/inspect
POST /api/auth/password/reset/complete
```

If the account has MFA enabled, password reset must include the reset token and either the current Authenticator code or an unused backup code. A user who loses the password, the Authenticator app, and every backup code has no self-service way back in.

## Email

The backend sends three kinds of email through plain SMTP, which every mail provider supports: password reset links, an alert when an account is signed in to from a browser it has not used before, and the one-time codes described under Account Recovery. Configure it in the project root `.env`:

```env
PASSWORD_RESET_DELIVERY=email
PRODUCT_NAME=GozilaSim ID
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_SECURITY=starttls
EMAIL_FROM=GozilaSim ID <no-reply@example.com>
```

`SMTP_SECURITY` is `starttls` (usually port 587), `ssl` (usually port 465), or `none`. Email is off while `SMTP_HOST` or `EMAIL_FROM` is empty. Messages are sent after the API has answered, and a failed delivery is logged without failing the request. Emails are written in the language saved on the account (English or Chinese).

## Sign-In Lockout

Wrong passwords and wrong verification codes are counted per account and per IP address. After `AUTH_MAX_FAILED_ATTEMPTS` (default 5) failures in a row, sign-in for that account or address answers `429 Too Many Requests` with a `Retry-After` header for `AUTH_LOCKOUT_MINUTES` (default 15) minutes. A successful sign-in or password reset clears the count. The same limit covers password reset completion, changing the password, and turning off MFA.

Counters are stored hashed in the `auth_throttles` table, so no email address or IP address is kept in readable form. Set `TRUST_PROXY_HEADERS=true` behind a trusted reverse proxy, otherwise every visitor shares the proxy's address and one person's failures lock everyone out.

## Account Recovery

Users with MFA turned on can prepare two ways to sign in without the Authenticator app. On the verification step the sign-in page offers them under "Try another way".

- Backup codes: ten 8-digit codes, each usable once. They are stored hashed and returned only by the request that creates them, so they cannot be shown again. Creating a new set cancels the old one, and turning MFA off deletes them.
- Recovery email: a second address, confirmed with an emailed code before it is saved. It cannot be the sign-in address.

The sign-in email address is verified the same way. Emailed codes have 6 digits and last 10 minutes. Wrong codes count toward the sign-in lockout, and how often a code can be requested is capped by the same limit.

```text
POST /api/auth/backup-codes
POST /api/auth/recovery-email
POST /api/auth/recovery-email/verify
POST /api/auth/recovery-email/remove
POST /api/auth/email/verification
POST /api/auth/email/verification/confirm
POST /api/auth/mfa/login/recovery-email
```

`POST /api/auth/mfa/login/verify` takes a `method` of `totp`, `backup_code`, or `recovery_email`, and the sign-in response lists the methods the account has in `mfa_methods`. Creating backup codes and adding or removing the recovery email require the current password.

Emailed codes need the Email settings above. While email is off, the code endpoints work only in local development, when `FRONTEND_ORIGIN` is a localhost address: the code is written to the backend log and returned in the response as `dev_code`. On a deployed site with email off they answer `503`, and sign-in does not offer the recovery email. Backup codes never depend on email.

## Profile And Session API

The backend supports profile completion after registration. The frontend can use `profile_completion.next_prompt_field` from `GET /api/auth/me` to show a skippable onboarding prompt.

```text
PATCH /api/profile
POST /api/profile/onboarding/skip
POST /api/profile/onboarding/complete
GET /api/auth/sessions
DELETE /api/auth/sessions/{session_id}
POST /api/auth/sessions/logout-others
GET /api/auth/security-events
GET /api/profile/avatar/history
POST /api/profile/avatar/restore
DELETE /api/profile/avatar/history/{public_id}
```

Sessions record login IP, last seen IP, User-Agent, and device label. By default, only `request.client.host` is trusted. When deploying behind a reverse proxy, enable this only after confirming the proxy is trusted:

```env
TRUST_PROXY_HEADERS=true
```

Avatar history is stored in the `users.avatar_history` JSON field. When a user changes their avatar, the old Cloudinary image is kept and added to history. The corresponding Cloudinary asset is deleted only when the delete avatar history API is called.

## OIDC Integrated Apps

When the Portal backend starts, it reads `OIDC_CLIENTS_JSON` from the project root `.env` and automatically registers or updates integrated apps. No manual database edits are required.

```env
OIDC_CLIENTS_JSON=[{"client_id":"media-editor-dev","name":"Media Editor Dev","home_url":"http://localhost:3001","icon_url":"http://localhost:3001/favicon.png","redirect_uris":["http://localhost:3001/auth/callback"],"allowed_scopes":["openid","email","profile","phone"],"public":true,"launcher_visible":true}]
```

`client_id` and `redirect_uri` must exactly match the `.env` values of the integrated app. The `seed_client` script is still available for one-off maintenance:

```powershell
cd backend
python -m app.scripts.seed_client --client-id media-editor-dev --name "Media Editor Dev" --redirect-uri "http://localhost:3001/auth/callback" --public
```

Other projects should point their login entry to:

```text
GET /oauth/authorize?response_type=code&client_id=media-editor-dev&redirect_uri=http://localhost:3001/auth/callback&scope=openid email profile phone&state=...&code_challenge=...&code_challenge_method=S256
```

The backend answers with an authorization code only when the user is signed in and has agreed to that app. In every other case it redirects to the frontend popup page:

```text
/authorize?next=<encoded oauth authorize url>
```

`/authorize` is the compact page for the `Login via Portal` popup window. It displays the target app name and requested scopes, signs the user in with password/MFA when needed, and asks whether the app may continue. Selecting Continue saves the agreement and returns to the original `/oauth/authorize` flow, which then issues the code. The frontend reads the app name from the context endpoint, which also reports `consent_required` for a signed-in user:

```text
GET /oauth/authorize/context?client_id=...&redirect_uri=...&scope=...
POST /oauth/authorize/consent
```

The account console app launcher uses the authenticated endpoint below. `home_url` is required for a client to appear in the launcher, `icon_url` is optional, and `launcher_visible` defaults to `true`.

```text
GET /api/apps/launcher
```

Apps that use Portal sign-in can send their top-right account or app-launcher button to the Portal account home. If the browser still has a valid Portal session, the user lands signed in:

```js
window.location.href = "https://gozilasim-account.gozilasim.win/account";
```

### App Consent And Connected Apps

Every app needs the user's agreement once. The agreement is stored per account and app in the `app_consents` table, together with the scopes that were agreed to. A later request for a scope outside that list goes through the consent page again. Migration `0008_app_consents` gives existing users a record for each app they had already signed in to, so they are not asked again.

The account console lists these apps under Connected apps:

```text
GET /api/apps/connected
DELETE /api/apps/connected/{client_id}
```

Removing an app deletes the agreement, revokes its access tokens for that user, and cancels any authorization code that was not exchanged yet. The Portal cannot end the session an app keeps on its own side, and it cannot delete what the app already stored.

## Account Data And Deletion

Users manage their own data under Data and privacy:

```text
GET /api/account/data-summary
GET /api/account/export
POST /api/account/delete/code
POST /api/account/delete
```

`GET /api/account/export` returns one JSON document with the profile, sign-in settings, active sessions, the full security activity, and connected apps. It never contains the password hash, the MFA secret, backup codes, or token hashes.

`POST /api/account/delete` removes the account and every row that belongs to it at once: sessions, security activity, backup codes, app consents, authorization codes, and access tokens. Stored profile pictures are deleted from Cloudinary afterwards. There is no grace period and no way to restore the account. The request must carry the account email, the current password, and a code:

- With MFA on: an Authenticator code or an unused backup code.
- With MFA off: a 6-digit code sent to the sign-in address by `POST /api/account/delete/code`.
- With MFA off and no way to send email (a deployed site without SMTP): no code. `delete_confirmation` in the data summary tells the frontend which of the three applies.

Wrong passwords and codes count toward the sign-in lockout. When email is configured, the owner gets a final message saying the account was deleted.

The security checkup on the Security page and the account home is computed in the frontend from `GET /api/auth/me` (including `password_changed_at`), the sessions, the security activity, and the connected apps.

## Version 1 Boundaries

- No owner/viewer/admin roles.
- No team permissions.
- No billing/subscription/quota support.
- Email goes out through SMTP only; there is no provider-specific API integration.
- No recovery phone or SMS codes. Recovery is limited to backup codes and a recovery email.
