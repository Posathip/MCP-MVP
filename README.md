# MVP MCP Deployer

A web service that clones a public GitHub repository and builds/runs it with Docker, streaming build logs in real time over WebSockets. Deployed containers are tracked in Postgres (via Prisma) and the service ships with an admin panel for managing the domains/ports containers get exposed through.

## What it does

1. An admin logs into `/admin` (or calls `/api/auth/login` directly) to get a JWT access/refresh token pair.
2. An admin adds spare `ResourceServer` rows (domain + external port, `status: 'available'`) via the admin panel or `POST /api/resource-servers` — this is the pool that builds pick a port from.
3. Anyone with the shared `API_KEY` (no login required) posts a GitHub repo URL to `POST /api/build`. No external port is supplied by the caller. `userId` is optional, caller-supplied, and unverified — defaults to `'anonymous'` if omitted.
4. The service claims the lowest-numbered `available` `ResourceServer` row (flips it to `in_use`) and uses its `port`/`domainName` for the deploy. Rebuilding a repo whose existing container is **not** `status: 'running'` replaces it in place (same name, same port). Rebuilding a repo whose existing container **is** `status: 'running'` leaves it completely untouched and instead deploys a second, side-by-side instance on a freshly-claimed port, named `<baseName>-<port>` so it doesn't collide with the still-running original — nothing gets torn down automatically; stop/delete a specific instance yourself via `/api/containers/:id`. If none are `available`, the request fails with `409` — add more rows first.
5. The service clones the repo into `workspaces/`.
6. It builds and runs the repo's `Dockerfile` (`docker build` + `docker run`), mapping the claimed external port to the internal port the app listens on. A repo without a `Dockerfile` fails the build — `docker-compose.yml`-based repos aren't supported.
7. If a `DATABASE_URI` env var is supplied, it's passed to the container as a positional arg along with `--transport sse` (for MCP servers such as `postgres-mcp` that need SSE transport to be reachable remotely).
8. Every docker/git command and its stdout/stderr is streamed live over Socket.IO (`build-log` event).
9. Once the deploy finishes, a row is upserted into `ContainerDetail` (`status: 'running'` or `status: 'error'`, plus `workspaceDir` for reference), and the result is returned in the `POST /api/build` HTTP response — `{ status: 'done', url, containerName, containerId, internalPort, externalPort, resourceServerId, userId }` on success, `{ status: 'error', error, containerName }` on failure. If a freshly-claimed `ResourceServer` failed to deploy, it's released back to `available`.

## Project structure

```
server.js                     # composition root — wires everything together and starts listening
prisma/
  schema.prisma                # Admin, ResourceServer, ContainerDetail models
  migrations/                  # generated SQL migrations
lib/
  SocketManager.js              # wraps socket.io, creates a per-request log emitter
  prisma.js                     # PrismaClient singleton
middleware/
  authenticate.js               # verifies the Bearer access token, sets req.admin
utils/
  slugify.js                    # string slug helper
  jwt.js                        # sign/verify access + refresh tokens
  asyncHandler.js                # wraps async route handlers so errors reach Express's error middleware
services/
  DockerRunner.js                # spawns git/docker commands, streams output, announces commands
  BuildService.js                 # core build/deploy logic (Dockerfile only, port + env handling)
controllers/
  HealthController.js             # GET /api/health
  WorkspaceController.js          # POST /api/workspaces/clear
  BuildController.js               # POST /api/build — validates input, kicks off BuildService, persists ContainerDetail
  AuthController.js                 # register / login / refresh / logout
  ResourceServerController.js        # CRUD for ResourceServer
  ContainerController.js              # list / stop / start ContainerDetail rows
routes/
  apiRouter.js                    # maps routes to controller instances
admin/                          # static frontend — see below
workspaces/                     # cloned repos land here (cleared via the API)
```

## Frontend (`admin/`)

Everything under `/admin` is plain static HTML/JS served by this same Express app (no build step, no separate frontend project). Visiting `/` redirects to the landing page, which offers two separate sign-in flows:

| Page                          | Purpose                                                              |
|--------------------------------|-----------------------------------------------------------------------|
| `/admin/index.html`            | Landing page — choose **User** or **Admin**                          |
| `/admin/login.html`            | User login **and self-registration** (new accounts get `role: 'user'`) |
| `/admin/admin-login.html`      | Admin login only — no self-registration; rejects accounts without `role: 'admin'` |
| `/admin/build.html`            | GitHub-repo build form + live logs. Reachable by both roles. Default landing page after login. |
| `/admin/dashboard.html`        | ResourceServer CRUD + container list with Stop/Start. **Admin role only** — a `user`-role session is redirected back to `build.html`, and the API itself also enforces this (`403`). |

`admin/auth.js` holds the shared JWT storage/refresh helpers (`apiFetch`, `requireAuthOrRedirect`) used by every page.

## Requirements

- Node.js 24+
- Docker (with the CLI available, and BuildKit/`docker-cli-buildx` if you build the deployer itself in a container)
- Git
- Postgres (either via the bundled `docker-compose.yml` service, or your own instance)

## Environment variables (`.env`)

```
PORT=4003

# Postgres database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=containermanagement
POSTGRES_PORT=5432

# Used by Prisma + the app when running outside Docker (npm run dev).
# docker-compose.yml overrides this to point at the "postgres" service instead of localhost.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/containermanagement

# JWT secrets - change these before deploying anywhere real
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Shared secret required (as an X-API-Key header) by every endpoint except /api/auth/*.
API_KEY=change-me-api-key
```

## Running locally

```bash
npm install
npx prisma migrate dev   # applies migrations to the Postgres instance pointed at by DATABASE_URL
npm run dev               # nodemon, or `npm start` for a plain run
```

The API/WebSocket server is then reachable at `http://localhost:4003`, and the frontend at `http://localhost:4003/` (redirects to the User/Admin chooser).

## Running with Docker Compose

`docker-compose.yml` starts both Postgres and the deployer. The deployer container runs `prisma migrate deploy` on startup, then `node server.js`. Because it needs to run `docker build`/`docker run` on behalf of cloned repos, it talks to the **host's** Docker daemon via the mounted socket (sibling-container pattern), and mounts the project directory at the same absolute path on both sides so build-context paths resolve correctly.

```bash
cd "/path/to/MVP MCP"
docker compose up -d --build
```

All values (`PORT`, `POSTGRES_*`, `JWT_*`, `API_KEY`) are read from `.env` — no hardcoded values.

## Authentication & roles

Two independent layers:

- **API key** — every endpoint except `/api/auth/*` (the login flow itself) requires an `X-API-Key` header matching `API_KEY`. It's a single shared secret gating "is this a trusted caller at all", checked by `middleware/apiKey.js`. `/admin/config.js` serves it to the admin panel's JS at runtime (`window.API_KEY`) so `admin/auth.js` can attach it automatically — note this means the key is readable by anyone who loads an admin page, same as any browser-embedded secret; treat it as a trusted-network gate, not a real per-client credential.
- **JWT (`Bearer <accessToken>`)** — required in addition to the API key on the resource-server, container, and account-management endpoints (identifies *which* account, and its role). Access tokens are short-lived (`JWT_ACCESS_EXPIRES_IN`, default 15m); use `/api/auth/refresh` with the refresh token to get a new pair without logging in again. `admin/auth.js` does this automatically on a 401.

`/api/health`, `/api/workspaces/clear`, and `/api/build` only need the API key — no JWT/login required.

Accounts have a `role` — `admin` or `user`:
- `POST /api/auth/register` (self-service) always creates `role: 'user'`. There's no self-service way to become `admin` — provision those accounts directly (e.g. `prisma.admin.update({ where: { username }, data: { role: 'admin' } })`, or through `POST /api/auth/register` followed by that same update, or `node scripts/create-admin.js <username> <password>` for the very first one).
- `role: 'user'` and `role: 'admin'` are otherwise equivalent for `POST /api/build` (also unauthenticated callers, since it only needs the API key) but `403` from resource-server CRUD and container/account management if not `admin`.
- `role: 'admin'` can do everything, plus manage `ResourceServer` rows, containers, and other accounts.

## API

| Method | Path                        | Auth              | Description                                  |
|--------|-----------------------------|-------------------|-----------------------------------------------|
| GET    | `/api/health`               | API key           | Health check                                  |
| POST   | `/api/auth/register`        | –                 | Self-register, always `role: 'user'`. Returns tokens |
| POST   | `/api/auth/login`           | –                 | Log in, returns tokens (includes `role`)       |
| POST   | `/api/auth/refresh`         | –                 | Exchange a refresh token for a new pair (rotates it) |
| POST   | `/api/auth/logout`          | JWT (any role)    | Revokes the caller's refresh token             |
| POST   | `/api/workspaces/clear`     | API key           | Deletes everything under `workspaces/`         |
| POST   | `/api/build`                | API key           | Body: `{ repoUrl, userId?, env[], internalPort }` — `userId` is caller-supplied, unverified, defaults to `'anonymous'`. Auto-claims an available ResourceServer's port, clone+build+run, upserts ContainerDetail. Returns `{ status, url, containerName, containerId, internalPort, externalPort, resourceServerId, userId }` on success. `409` if no ResourceServer available |
| GET    | `/api/resource-servers`     | API key + JWT admin | List resource servers (domain + external port + status) |
| POST   | `/api/resource-servers`     | API key + JWT admin | Create one — `{ domainName, port, status? }` (status defaults to `available`) |
| GET    | `/api/resource-servers/:id` | API key + JWT admin | Get one                                        |
| PUT    | `/api/resource-servers/:id` | API key + JWT admin | Update one, all fields optional (also used to manually release a stuck row: `{ status: 'available' }`) |
| DELETE | `/api/resource-servers/:id` | API key + JWT admin | Delete one                                     |
| GET    | `/api/containers`           | API key + JWT admin | List containers created by builds             |
| GET    | `/api/containers/:id`       | API key + JWT admin | `:id` is `containerName` **or** `containerId`. Get one container's details |
| GET    | `/api/containers/:id/logs`  | API key + JWT admin | `:id` is `containerName` **or** `containerId`. Runs `docker logs --tail <tail> --timestamps`, returns `{ containerName, tail, logs }`. `?tail=` query param, default 200, capped at 5000 |
| POST   | `/api/containers/:id/stop`  | API key + JWT admin | `:id` is `containerName` **or** `containerId` (real Docker id) - either resolves the row. Runs `docker stop <containerName>`, sets `status: 'stopped'` |
| POST   | `/api/containers/:id/start` | API key + JWT admin | `:id` is `containerName` **or** `containerId`. Runs `docker start <containerName>`, sets `status: 'running'` |
| POST   | `/api/containers/:id/restart` | API key + JWT admin | `:id` is `containerName` **or** `containerId`. Runs `docker restart <containerName>`, sets `status: 'running'` |
| DELETE | `/api/containers/:id`       | API key             | `:id` is `containerName` **or** `containerId`. Removes the Docker container + image, deletes the ContainerDetail row, releases its ResourceServer back to `available`, deletes `workspaceDir` from disk, and returns `{ status: 'ok', message, containerName }` |
| GET    | `/api/admins`               | API key + JWT admin | List login accounts (never includes password/refresh-token hashes) |
| POST   | `/api/admins`               | API key + JWT admin | Create one — `{ username, password, role? }` (role defaults to `user`; unlike `/api/auth/register`, this can create `admin` accounts directly) |
| GET    | `/api/admins/:id`           | API key + JWT admin | Get one                                        |
| PUT    | `/api/admins/:id`           | API key + JWT admin | Update `{ username?, password?, role? }`. Blocks demoting the last remaining admin (`400`) |
| DELETE | `/api/admins/:id`           | API key + JWT admin | Delete one. Blocks deleting yourself or the last remaining admin (`400`) |

Full interactive docs (OpenAPI/Swagger) are at `/api/swagger`.

`stop`/`start` always resolve `containerName` directly, since every build runs `docker run --name <containerName>`.

Build progress is emitted over the `build-log` Socket.IO event, broadcast to every connected client (there's no per-caller targeting — any open socket connection sees every build's logs). On success, the final event has `stage: 'done'` and includes a `url` field — the endpoint (`http://<host>:<externalPort>`) where the deployed app can now be reached.

## Data model

- **Admin** — local login accounts (`id` sequential int for internal FKs, `uuid` for anything external-facing, `username`, `passwordHash`, `role`, `refreshTokenHash`). Despite the model name it holds both `user`- and `admin`-role accounts. Not a foreign key of `ContainerDetail.userId` — the two are only linked in that `userId` *defaults* to the caller's `uuid`.
- **ResourceServer** — a domain + external port pair that containers get deployed behind, plus a `status` (`available` | `in_use`) that `POST /api/build` uses to auto-claim a free port. Primary key is `id`, a real random uuid; `resourceServerId` (sequential, auto-increment) is a separate unique key — it's what the CRUD paths (`/api/resource-servers/:id`) and `ContainerDetail.resourceServerId` actually use, unchanged from before. Managed via the CRUD endpoints / admin panel; use `PUT` with `{ status: 'available' }` to manually release a row that got stuck `in_use` (e.g. after manually removing a container).
- **ContainerDetail** — one row per build. Primary key is `id`, a real random uuid (like `Admin.uuid`, not a sequential int); `containerName` (the slugified `owner-repo` name, also used as the Docker `--name`/image tag — every build runs `docker run --name <containerName>`) is a separate unique key, and is what `/api/containers/:id/stop|start` actually take as `:id`. `containerId` is the real Docker-assigned container id, captured from `docker run`'s output — informational only, nullable (older rows won't have it). `userId` defaults to the building account's `uuid` (a real random id, never the sequential `Admin.id`) but can be overridden in the request body — it is **not** a foreign key to `Admin`. `status` is `running`, `error`, or `stopped`. `workspaceDir` records where the repo was cloned, for reference.
