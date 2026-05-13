<!--
Created at: 2026-05-11 01:17
Updated at: 2026-05-12 02:42
Description: Setup and usage guide for the unified account Portal.
-->

# Account Management Portal

统一账号 Portal 第一版：用户只注册一次，之后其他 project 可以通过 `Login via Portal` 使用同一个账号登录。

## 目录

- `backend/`：FastAPI + SQLite local database + OIDC Provider + MFA + Cloudinary avatar upload
- `frontend/`：React + Vite Portal UI

## 本地启动

1. 建立根目录 backend `.env`：

```powershell
copy .env.example .env
```

2. 后端：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
python -m app.scripts.dev
```

3. 前端：

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

默认地址：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- OIDC discovery: `http://localhost:8000/.well-known/openid-configuration`

## Docker Backend

Backend 可以用 Docker 启动，数据库默认是 SQLite，并挂载到项目根目录 `data/portal.db`：

```powershell
docker compose up --build
```

每次 container 启动时，`backend/docker-entrypoint.sh` 会先执行：

```powershell
python -m alembic upgrade head
```

迁移完成后才会启动 FastAPI。Docker 里的 SQLite 路径默认是 `sqlite:////app/data/portal.db`，对应本机项目根目录的 `data/portal.db`。

## Port 设置

Backend 的 `.env` 放在项目根目录；frontend 的 `.env` 放在 `frontend/` 里面。

项目根目录 `.env`：

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

如果你把根目录 `.env` 的 `BACKEND_PORT` 改成例如 `8010`，也要把 `frontend/.env` 的 `VITE_API_BASE_URL` 改成 `http://localhost:8010`。生产环境或自定义 domain 可以显式设置 `BACKEND_URL` 和 `FRONTEND_URL`。

## Cloudinary

Cloudinary secret 只配置在项目根目录 `.env`：

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

前端不会接触 Cloudinary secret。头像由 frontend 上传到 backend，再由 backend 校验并上传到 Cloudinary。

## Forgot Password

第一版不接真实 email API。忘记密码请求会生成 reset token，并在 `PASSWORD_RESET_DELIVERY=dev_log` 时写入 backend 日志，同时在开发响应里返回 reset link，方便本地测试。

流程：

```text
POST /api/auth/password/forgot
POST /api/auth/password/reset/inspect
POST /api/auth/password/reset/complete
```

如果账号开启 MFA，reset password 必须同时提供 reset token 和当前 Authenticator code。用户如果同时丢失密码和 MFA，第一版不提供自助恢复路径。

## Profile 和 Session API

Backend 已支持注册后补充资料，frontend 可以根据 `GET /api/auth/me` 的 `profile_completion.next_prompt_field` 做可跳过的 onboarding 弹窗。

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

Session 会记录 login IP、last seen IP、User-Agent 和 device label。默认只信任 `request.client.host`；部署在反向代理后面时，确认代理可信再设置：

```env
TRUST_PROXY_HEADERS=true
```

Avatar history 存在 `users.avatar_history` JSON 里。用户换头像时旧 Cloudinary 图片会保留并进入历史列表；只有调用删除历史头像 API 时才会删除对应 Cloudinary asset。

## OIDC Integrated Apps

Portal backend 启动时会读取根目录 `.env` 的 `OIDC_CLIENTS_JSON`，并自动注册或更新 integrated apps。不需要手动改 DB。

```env
OIDC_CLIENTS_JSON=[{"client_id":"media-editor-dev","name":"Media Editor Dev","redirect_uris":["http://localhost:3001/auth/callback"],"allowed_scopes":["openid","email","profile","phone"],"public":true}]
```

`client_id` 和 `redirect_uri` 必须和接入 app 的 `.env` 完全一致。`seed_client` 脚本仍保留给一次性维护使用：

```powershell
cd backend
python -m app.scripts.seed_client --client-id media-editor-dev --name "Media Editor Dev" --redirect-uri "http://localhost:3001/auth/callback" --public
```

其他 project 的登录入口指向：

```text
GET /oauth/authorize?response_type=code&client_id=media-editor-dev&redirect_uri=http://localhost:3001/auth/callback&scope=openid email profile phone&state=...&code_challenge=...&code_challenge_method=S256
```

如果用户还没有 Portal session，backend 会 redirect 到 frontend popup 页面：

```text
/authorize?next=<encoded oauth authorize url>
```

`/authorize` 是给 `Login via Portal` popup window 使用的窄版登录页。它会显示目标 app 名称、requested scopes，并在用户完成 password/MFA 后继续回到原本的 `/oauth/authorize` flow。前端可以用 public context endpoint 取得 app 名称：

```text
GET /oauth/authorize/context?client_id=...&redirect_uri=...&scope=...
```

## 第一版边界

- 不做 owner/viewer/admin role。
- 不做 team permission。
- 不做 billing/subscription/quota。
- 忘记密码只做 `dev_log` reset link，不接真实邮件服务。
- 丢失 MFA 不提供自助恢复流程。
