<!--
Created at: 2026-05-11 01:17
Updated at: 2026-05-11 01:40
Description: Setup and usage guide for the unified account Portal.
-->

# Account Management Portal

统一账号 Portal 第一版：用户只注册一次，之后其他 project 可以通过 `Login via Portal` 使用同一个账号登录。

## 目录

- `backend/`：FastAPI + PostgreSQL + OIDC Provider + MFA + Cloudinary avatar upload
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

## 建立 OIDC Client

示例：

```powershell
cd backend
python -m app.scripts.seed_client --client-id media-editor-dev --name "Media Editor Dev" --redirect-uri "http://localhost:3000/auth/callback" --public
```

其他 project 的登录入口指向：

```text
GET /oauth/authorize?response_type=code&client_id=media-editor-dev&redirect_uri=http://localhost:3000/auth/callback&scope=openid email profile&state=...&code_challenge=...&code_challenge_method=S256
```

## 第一版边界

- 不做 owner/viewer/admin role。
- 不做 team permission。
- 不做 billing/subscription/quota。
- 忘记密码邮件重置暂不开放，先实现已登录后的修改密码。
