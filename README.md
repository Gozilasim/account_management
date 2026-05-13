<!--
Created at: 2026-05-11 01:17
Updated at: 2026-05-14 00:11
Description: Setup and usage guide for the unified account Portal.
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

Version 1 does not integrate with a real email API. Forgot password requests generate a reset token. When `PASSWORD_RESET_DELIVERY=dev_log`, the backend writes the reset link to logs and also returns it in the development response for local testing.

Flow:

```text
POST /api/auth/password/forgot
POST /api/auth/password/reset/inspect
POST /api/auth/password/reset/complete
```

If the account has MFA enabled, password reset must include both the reset token and the current Authenticator code. Version 1 does not provide a self-service recovery path for users who lose both their password and MFA access.

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
OIDC_CLIENTS_JSON=[{"client_id":"media-editor-dev","name":"Media Editor Dev","redirect_uris":["http://localhost:3001/auth/callback"],"allowed_scopes":["openid","email","profile","phone"],"public":true}]
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

If the user does not have a Portal session yet, the backend redirects to the frontend popup page:

```text
/authorize?next=<encoded oauth authorize url>
```

`/authorize` is the compact login page for the `Login via Portal` popup window. It displays the target app name and requested scopes, then continues back to the original `/oauth/authorize` flow after password/MFA completion. The frontend can fetch the app name from the public context endpoint:

```text
GET /oauth/authorize/context?client_id=...&redirect_uri=...&scope=...
```

## Version 1 Boundaries

- No owner/viewer/admin roles.
- No team permissions.
- No billing/subscription/quota support.
- Forgot password only supports `dev_log` reset links; no real email delivery is integrated.
- No self-service recovery flow for lost MFA access.
