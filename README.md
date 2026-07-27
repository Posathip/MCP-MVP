# MVP MCP Deployer

A small web service that clones a public GitHub repository and builds/runs it with Docker, streaming build logs to the browser in real time over WebSockets.

## What it does

1. You paste a GitHub repo URL and (optionally) environment variables + external/internal ports in the web UI.
2. The service clones the repo into `workspaces/`.
3. If the repo has a `docker-compose.yml`/`compose.yaml`, it runs `docker compose build` + `docker compose up -d`.
4. Otherwise, if it has a `Dockerfile`, it runs `docker build` + `docker run` directly, mapping the external port you chose to the internal port the app listens on.
5. If a `DATABASE_URI` env var is supplied, it's passed to the container as a positional arg along with `--transport sse` (for MCP servers such as `postgres-mcp` that need SSE transport to be reachable remotely).
6. Every docker/git command and its stdout/stderr is streamed live to the UI via Socket.IO.

## Project structure

```
server.js                 # composition root — wires everything together and starts listening
lib/
  SocketManager.js         # wraps socket.io, creates a per-request log emitter
services/
  DockerRunner.js          # spawns git/docker commands, streams output, announces commands
  BuildService.js          # core build/deploy logic (compose vs Dockerfile path, port + env handling)
controllers/
  HealthController.js      # GET /api/health
  WorkspaceController.js   # POST /api/workspaces/clear
  BuildController.js       # POST /api/build — validates input, kicks off BuildService
routes/
  apiRouter.js              # maps routes to controller instances
utils/
  slugify.js                # string slug helper
workspaces/                 # cloned repos land here (cleared via the UI button or API)
```

This service is backend-only — it has no bundled frontend. Any client (e.g. a separate frontend project) connects to the REST API and the `build-log` Socket.IO event described below.

## Requirements

- Node.js 24+
- Docker (with the CLI available, and BuildKit/`docker-cli-buildx` if you build the deployer itself in a container)
- Git

## Running locally

```bash
npm install
npm run dev   # nodemon, or `npm start` for a plain run
```

Configure the port via `.env`:

```
PORT=4000
```

The API/WebSocket server is then reachable at `http://localhost:4000`.

## Running with Docker Compose

The deployer itself can run inside Docker. Because it needs to run `docker build`/`docker run` on behalf of cloned repos, it talks to the **host's** Docker daemon via the mounted socket (sibling-container pattern), and mounts the project directory at the same absolute path on both sides so build-context paths resolve correctly.

```bash
cd "/path/to/MVP MCP"
docker compose up -d --build
```

`docker-compose.yml` reads `PORT` from `.env` automatically — no hardcoded port values.

## API

| Method | Path                     | Description                                  |
|--------|--------------------------|-----------------------------------------------|
| GET    | `/api/health`            | Health check                                  |
| POST   | `/api/workspaces/clear`  | Deletes everything under `workspaces/`        |
| POST   | `/api/build`             | Body: `{ repoUrl, socketId, env[], externalPort, internalPort }` — starts a clone+build+run |

Build progress is emitted over the `build-log` Socket.IO event to the `socketId` passed in the request (or broadcast if omitted). On success, the final event has `stage: 'done'` and includes a `url` field — the endpoint (`http://<host>:<externalPort>`) where the deployed app can now be reached.
