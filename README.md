# StockFlow — Warehouse Management Platform

A full-stack warehouse management system built with **NestJS** + **React**, featuring multi-role authentication, inventory tracking, item assignments, and a worker-to-worker transfer request workflow.

---

## Architecture

```
warehouse-platform/
├── backend/                  # NestJS API (port 3001)
│   └── src/
│       ├── auth/             # JWT auth, login, register
│       ├── users/            # User CRUD, role management
│       ├── inventory/        # Inventory items, stock management
│       ├── assignments/      # Item → Worker assignments
│       ├── transfer-requests/# Worker transfer workflow
│       └── common/           # Guards, decorators, filters
├── frontend/                 # React + Vite (port 3000)
│   └── src/
│       ├── pages/            # LoginPage, Dashboard, Inventory, Assignments, Transfers, Users
│       ├── components/       # Sidebar, Modal, AppLayout
│       ├── hooks/            # useApi.ts (all React Query hooks)
│       ├── contexts/         # AuthContext
│       └── types/            # TypeScript interfaces
└── docker-compose.yml
```

---

## Tech Stack

| Layer       | Technology                                           |
|-------------|------------------------------------------------------|
| Backend     | NestJS 10, TypeORM, PostgreSQL, Passport JWT, bcrypt |
| Frontend    | React 18, Vite, TanStack Query, React Router, Axios  |
| Auth        | JWT Bearer tokens, role-based access control         |
| Database    | PostgreSQL 15                                        |
| Dev         | Docker Compose                                       |

---

## Roles & Permissions

| Feature                        | Admin | Manager | Worker |
|-------------------------------|-------|---------|--------|
| View inventory                | ✓     | ✓       | ✓      |
| Add/edit inventory             | ✓     | ✓       | ✗      |
| Delete inventory               | ✓     | ✗       | ✗      |
| Assign items to workers        | ✓     | ✓       | ✗      |
| View all assignments           | ✓     | ✓       | own    |
| Return items                   | ✓     | ✓       | own    |
| Create transfer requests       | ✓     | ✓       | ✓      |
| Approve/reject transfers       | ✓     | ✓       | ✗      |
| Manage users                   | ✓     | view    | ✗      |
| Create users                   | ✓     | ✗       | ✗      |

---

## Transfer Workflow

```
Worker A (has 10 items)
    │
    ▼  creates TransferRequest (sourceAssignment, toUserId, quantity)
    │
    ▼  status = PENDING
    │
Manager/Admin reviews
    │
    ├── APPROVE → sourceAssignment.quantity -= N
    │             destAssignment (Worker B) += N
    │             status = APPROVED
    │
    └── REJECT  → status = REJECTED (with optional reason)

Worker A can CANCEL while PENDING
```

---

## Quick Start

### Option 1 — Docker (recommended)

```bash
# Copy env
cp backend/.env.example backend/.env

# Start everything
docker compose up -d

# The API seeds no data — create your first admin via POST /api/auth/register
```

### Option 2 — Local development

**Prerequisites:** Node 18+, PostgreSQL running locally

```bash
# 1. Backend
cd backend
cp .env.example .env          # Edit DB credentials
npm install
npx ts-node -r tsconfig-paths/register src/main.ts

# 2. Frontend (new terminal)
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## First-Time Setup

1. Open `http://localhost:3000`
2. Register your first admin user via the API:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin"
  }'
```

3. Log in at `http://localhost:3000/login`
4. Create managers and workers from the **Users** page
5. Add inventory items from the **Inventory** page
6. Assign items to workers from the **Assignments** page
7. Workers can create transfer requests from **Transfers**

---

## API Endpoints

### Auth
| Method | Path              | Access  |
|--------|-------------------|---------|
| POST   | /auth/login       | Public  |
| POST   | /auth/register    | Public  |
| GET    | /auth/me          | Any     |

### Inventory
| Method | Path                    | Access         |
|--------|-------------------------|----------------|
| GET    | /inventory              | Any            |
| GET    | /inventory/stats        | Admin/Manager  |
| POST   | /inventory              | Admin/Manager  |
| PUT    | /inventory/:id          | Admin/Manager  |
| PATCH  | /inventory/:id/stock    | Admin/Manager  |
| DELETE | /inventory/:id          | Admin only     |

### Assignments
| Method | Path                        | Access        |
|--------|-----------------------------|---------------|
| GET    | /assignments                | Any (filtered)|
| GET    | /assignments/my-inventory   | Any           |
| POST   | /assignments                | Admin/Manager |
| PATCH  | /assignments/:id/return     | Any (own)     |

### Transfer Requests
| Method | Path                          | Access         |
|--------|-------------------------------|----------------|
| GET    | /transfer-requests            | Any (filtered) |
| GET    | /transfer-requests/pending    | Admin/Manager  |
| POST   | /transfer-requests            | Any            |
| PATCH  | /transfer-requests/:id/review | Admin/Manager  |
| PATCH  | /transfer-requests/:id/cancel | Owner/Admin    |

### Users
| Method | Path         | Access        |
|--------|--------------|---------------|
| GET    | /users       | Admin/Manager |
| GET    | /users/workers | Admin/Manager |
| POST   | /users       | Admin only    |
| PUT    | /users/:id   | Admin only    |
| DELETE | /users/:id   | Admin only    |

---

## Extending the Platform

The architecture is designed to be scalable. Some next steps:

- **Notifications** — Add a `NotificationsModule` using EventEmitter2 to notify workers when transfers are approved
- **Audit Log** — Add an `AuditLogModule` entity to track all inventory movements
- **Barcode/QR scanning** — Add `serialNumber` scanning to assignments
- **Reports** — Export assignments/transfers to Excel using ExcelJS
- **File uploads** — Add item images via S3/MinIO
- **Email notifications** — NestJS Mailer module with SMTP
- **Real-time updates** — WebSockets via `@nestjs/websockets` for live transfer status
- **Multi-warehouse** — Add a `Warehouse` entity as a tenant boundary
