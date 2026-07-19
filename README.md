# University Task & Collaboration Management System (Uni-TCMS)

A production-oriented, ClickUp/Teams/Trello-inspired platform for universities.

**Hierarchy:** `University → Workspace (access-gated) → Space (Department/Faculty) → Cluster (Class/Subject/Lab/Project — self-nestable) → Task`

A Workspace and everything inside it (its Spaces, Clusters, Tasks) is invisible to users who have no access to that Workspace — a Super Admin creates workspaces and grants access; membership can also be inherited by belonging to a Space or Cluster within it.

Built with **React + TypeScript**, **Node.js + Express + TypeScript**, **PostgreSQL + Prisma**, **JWT auth + RBAC**, **Socket.IO** real-time, and **Swagger/OpenAPI** docs.

---

## ✨ What's in this first build (foundation + vertical slice)

| Layer | Delivered |
|-------|-----------|
| **Data model** | Full Prisma schema for the entire hierarchy + tasks, subtasks, checklists, comments/replies, mentions, attachments, submissions, grades, labels, dependencies, watchers, recurrence, announcements, chat, calendar, notifications, activity, audit logs, bookmarks, templates |
| **Auth** | Register / login / refresh-token rotation / logout / me — Argon2 hashing, JWT access + httpOnly refresh cookie |
| **RBAC** | Super Admin, Workspace Admin, Space Admin, Cluster Admin (Faculty), Manager, User — enforced by middleware at workspace, space, cluster & task scope |
| **APIs** | Workspaces (access-gated), Spaces, Clusters (nested), Tasks (CRUD, status, assignees, subtasks, checklist, comments, activity), grouped **Overview**, Users search, Notifications — documented at `/api/docs` |
| **Real-time** | Socket.IO with JWT handshake; live task/comment updates + notification toasts |
| **Frontend** | Login, sidebar (Spaces→Clusters tree), **Overview** grouped task board, per-Cluster board, task **comment drawer** — matching the reference mockups; light + dark themes |
| **Infra** | Full `docker-compose` (Postgres + Redis + backend + frontend) |

> Modules with schema + intent scaffolded for the next iterations: announcements, discussion chat UI, files/uploads, calendar, grading & submissions UI, dashboards, reports, global search, audit-log viewer, bulk ops, templates, archived semesters.

---

## 🚀 Quick start (Docker — recommended)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend → http://localhost:5373
- API → http://localhost:4000/api
- Swagger UI → http://localhost:4000/api/docs

The backend container auto-runs migrations + seed on start.

## 🧑‍💻 Local development (without Docker)

Requires Node 20+ and a PostgreSQL 16 instance.

```bash
# 1) Start just the databases via Docker (optional convenience)
docker compose up -d postgres redis

# 2) Backend
cd backend
cp ../.env.example .env         # then set DATABASE_URL host to localhost
npm install
npx prisma generate
npx prisma db push              # creates tables from schema.prisma (no migration files needed)
npm run seed
npm run dev                     # http://localhost:4000

# 3) Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

> For local runs, set `DATABASE_URL=postgresql://uni:uni_secret@localhost:5432/uni_tcms?schema=public` in `backend/.env`.

---

## 🔑 Seeded demo accounts

Password for **all** accounts: `Password123!`

| Role | Email |
|------|-------|
| Super Admin | `superadmin@eimple.com` |
| Space Admin (Computer Science) | `spaceadmin@eimple.com` |
| Cluster Admin / Faculty | `faculty@eimple.com` |
| Manager (Teaching Assistant) | `ta@eimple.com` |
| User (Student) | `aarav@eimple.com` (also bhavna@, chen@, diana@) |

Seeded structure mirrors the spec: **Computer Science → B.Tech 3rd Year → { DBMS, Operating Systems, AI Lab }**, plus Mechanical / MBA / Placement Cell spaces, with sample assignments, subtasks and comments.

---

## 🗂️ Project structure

```
.
├── docker-compose.yml
├── backend/
│   ├── prisma/schema.prisma      # full domain model
│   ├── prisma/seed.ts
│   └── src/
│       ├── app.ts / index.ts
│       ├── config/               # env
│       ├── lib/                  # prisma, jwt, errors, asyncHandler
│       ├── middleware/           # auth, rbac, validate, error
│       ├── realtime/io.ts        # Socket.IO
│       └── features/
│           ├── auth/  users/  workspaces/  spaces/  clusters/  tasks/  notifications/
└── frontend/
    └── src/
        ├── lib/                  # api (axios+refresh), socket
        ├── store/auth.ts         # zustand
        ├── components/           # Sidebar, AppLayout, TaskTable, TaskDrawer, ui
        └── pages/                # LoginPage, OverviewPage, ClusterPage
```

---

## 🛡️ RBAC model (summary)

- **Super Admin** — full control everywhere (creates Workspaces, manages users, reports).
- **Workspace Admin** — full control within one Workspace and all its Spaces/Clusters (creates Spaces, invites members). Everything about a workspace is invisible to anyone without access to it.
- **Space Admin** — full control within one Space and all its Clusters (creates Clusters, invites members).
- **Cluster Admin (Faculty)** — creates/assigns/grades tasks, announcements, subtasks within a Cluster.
- **Manager** — create/assign tasks & subtasks, participate.
- **User** — view assigned tasks, submit, comment, chat, move own status.

Access is resolved per request: `SUPER_ADMIN ⇒ all`; a `WORKSPACE_ADMIN` acts as `SPACE_ADMIN` inside their workspace; a `SPACE_ADMIN` acts as `CLUSTER_ADMIN` inside their space; otherwise cluster membership role applies. A user can *see* a workspace (and its spaces) either via direct workspace membership or by having any space/cluster membership within it — but never without one of those. See `backend/src/middleware/rbac.ts`.

---

## 📡 Key API endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` \| `/register` \| `/refresh` \| `/logout` | |
| GET | `/api/auth/me` | current user |
| GET/POST | `/api/workspaces` | list accessible (others invisible) / create (super admin) |
| GET/POST | `/api/workspaces/:workspaceId/spaces` | list / create (workspace admin) |
| GET | `/api/spaces` | flat list of accessible spaces across workspaces |
| GET/POST | `/api/spaces/:spaceId/clusters` | list / create (space admin) |
| GET/PATCH/DELETE | `/api/clusters/:clusterId` | + `/members` |
| GET | `/api/tasks/overview` | grouped by Space→Cluster (Overview page) |
| GET/POST | `/api/clusters/:clusterId/tasks` | list / create |
| PATCH | `/api/tasks/:taskId` | status, priority, dates… |
| PUT | `/api/tasks/:taskId/assignees` | |
| * | `/api/tasks/:taskId/subtasks` `/checklist` `/comments` `/activity` | |
| GET/POST | `/api/notifications` `/read` `/read-all` | |

Full interactive docs: **`/api/docs`**.

---

## 🧭 Roadmap (next iterations)

1. Announcement channel + discussion chat UIs (schema + sockets ready).
2. File uploads (Multer wired) & cluster file library.
3. Submissions + grading workflow UI, version history.
4. Role-specific dashboards, reports & analytics.
5. Calendar views, recurring tasks, dependencies UI.
6. Global search, audit-log viewer, bulk operations, task templates, archived semesters.
7. Email/push notification channels.

---

## 🔒 Production notes

- Set strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` and enable HTTPS (cookies become `secure`).
- Put object storage (S3/Azure Blob) behind the attachments layer for real deployments.
- Add the Socket.IO Redis adapter (Redis already in compose) when scaling horizontally.
