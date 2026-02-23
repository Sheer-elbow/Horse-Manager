# Smart Stable Manager

Web application for horse owners and polo players to manage horses, exercise plans, session logging, and stable records.

## Stack

- **Backend**: Node.js + Express + TypeScript + Prisma ORM
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Database**: PostgreSQL 16
- **Auth**: JWT (access + refresh tokens) + bcrypt
- **Reverse Proxy**: Caddy (automatic HTTPS)
- **Containerization**: Docker Compose

## Quick start (local development)

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker)
- npm

### 1. Clone and install

```bash
git clone <repo-url> && cd Horse-Manager
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Set up the database

Option A - Local Postgres:

```bash
createdb stablemanager
```

Option B - Docker Postgres:

```bash
docker run -d --name stablemanager-db \
  -e POSTGRES_USER=stablemanager \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=stablemanager \
  -p 5432:5432 postgres:16-alpine
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values. For local dev, the key ones are:
#   DATABASE_URL=postgresql://stablemanager:changeme@localhost:5432/stablemanager
#   ADMIN_EMAIL=admin@example.com
#   ADMIN_PASSWORD=YourTempPassword123!
#   JWT_SECRET=any-random-string
#   JWT_REFRESH_SECRET=another-random-string
```

### 4. Run migrations and seed

```bash
cd backend
export DATABASE_URL="postgresql://stablemanager:changeme@localhost:5432/stablemanager"
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

### 5. Start dev servers

Terminal 1 (backend):
```bash
cd backend
npm run dev
```

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```

Visit **http://localhost:5173**. Login with the admin credentials from `.env`. You'll be prompted to change the password on first login.

---

## Deploy on DigitalOcean droplet

### Prerequisites on the droplet

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (if not included)
sudo apt-get install docker-compose-plugin
```

### 1. Clone the repo

```bash
cd /opt
git clone <repo-url> stable-manager
cd stable-manager
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

**Required settings for production:**

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://stablemanager:STRONG_PASSWORD@db:5432/stablemanager` | Use `db` as host (Docker network) |
| `POSTGRES_USER` | `stablemanager` | |
| `POSTGRES_PASSWORD` | `STRONG_PASSWORD` | Use a strong password |
| `POSTGRES_DB` | `stablemanager` | |
| `JWT_SECRET` | `(random 64-char string)` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | `(random 64-char string)` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | `you@example.com` | Your admin login email |
| `ADMIN_PASSWORD` | `TempPassword123!` | Changed on first login |
| `SMTP_HOST` | `smtp.mailgun.org` | Your SMTP provider |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `postmaster@mg.example.com` | |
| `SMTP_PASS` | `smtp-password` | |
| `SMTP_FROM` | `stable@example.com` | |
| `APP_URL` | `https://stable.yourdomain.com` | Full URL |
| `DOMAIN` | `stable.yourdomain.com` | Used by Caddy for HTTPS |
| `NODE_ENV` | `production` | |

### 3. Deploy

```bash
./deploy.sh
```

The app will be available at your domain with automatic HTTPS via Caddy.

---

## Cloudflare DNS setup

### DNS Records

Add an **A record** in Cloudflare DNS:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `stable` (or your subdomain) | `YOUR_DROPLET_IP` | Proxied (orange cloud) |

### SSL/TLS settings

In Cloudflare dashboard > SSL/TLS:

- Set encryption mode to **Full (strict)**
  - Caddy on the server obtains its own Let's Encrypt certificate
  - Cloudflare connects to the server over HTTPS and validates the cert
  - This is the most secure configuration

> If you have issues with certificate provisioning, temporarily set to **Full** (not strict) while Caddy obtains the cert, then switch back.

### Recommended Cloudflare settings

- **SSL/TLS > Edge Certificates**: Enable "Always Use HTTPS"
- **SSL/TLS > Edge Certificates**: Set Minimum TLS Version to 1.2
- **Speed > Optimization**: Enable Auto Minify (optional)

---

## Database backups

A backup script is included at `scripts/backup.sh`. It creates compressed SQL dumps and retains 14 days of backups.

### Setup

```bash
# Add to crontab (runs daily at 3 AM):
crontab -e
# Add this line:
0 3 * * * /opt/stable-manager/scripts/backup.sh >> /var/log/stable-manager-backup.log 2>&1
```

### Manual backup

```bash
./scripts/backup.sh
```

### Restore from backup

```bash
gunzip < backups/stablemanager_20250101_030000.sql.gz | \
  docker exec -i horse-manager-db-1 psql -U stablemanager stablemanager
```

---

## GitHub Actions CI/CD

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on push to `main`.

### Setup

1. In your GitHub repo, go to **Settings > Secrets and variables > Actions**
2. Add these repository secrets:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | Your droplet IP address |
| `DEPLOY_USER` | SSH user (e.g., `root` or `deploy`) |
| `SSH_PRIVATE_KEY` | Private SSH key for the deploy user |

3. On the droplet, ensure the repo is cloned at `/opt/stable-manager` and `.env` is configured.

4. Push to `main` to trigger a deploy. You can also trigger manually from the Actions tab.

---

## Architecture

```
┌──────────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Cloudflare  │────>│  Caddy   │────>│ Frontend │────>│ Backend  │
│  (DNS/CDN)   │     │ (HTTPS)  │     │ (Nginx)  │     │ (Express)│
└──────────────┘     └──────────┘     └──────────┘     └────┬─────┘
                                                            │
                                                       ┌────┴─────┐
                                                       │ Postgres │
                                                       └──────────┘
```

### API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | - | Login |
| POST | `/api/auth/refresh` | - | Refresh JWT |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/change-password` | JWT | Change password |
| POST | `/api/auth/invite` | Admin | Send invite |
| POST | `/api/auth/accept-invite` | - | Accept invite |
| GET | `/api/auth/invites` | Admin | List invites |
| GET/POST | `/api/horses` | JWT | List/create horses |
| GET/PUT/DELETE | `/api/horses/:id` | JWT+RBAC | Horse CRUD |
| GET/POST/DELETE | `/api/horses/:id/assignments` | Admin | Manage assignments |
| GET/POST | `/api/programmes` | JWT | List/create programmes |
| GET/PUT/DELETE | `/api/programmes/:id` | JWT | Programme CRUD |
| GET/POST | `/api/plans/blocks` | JWT+RBAC | Plan blocks |
| GET/POST/PUT/DELETE | `/api/plans/sessions` | JWT+RBAC | Planned sessions |
| POST | `/api/plans/copy-week` | JWT+RBAC | Copy week sessions |
| GET/POST/PUT | `/api/sessions` | JWT+RBAC | Actual session logs |
| GET | `/api/sessions/:id/audit` | JWT+RBAC | Audit history |
| CRUD | `/api/health/:horseId/*` | JWT+RBAC | Vet/farrier/vaccination/expense records |

### RBAC model

- **Admin**: Full access to everything
- **User (VIEW)**: Can view assigned horse's data, plans, and sessions
- **User (EDIT)**: Can also edit plans and log sessions for assigned horses
- Permissions are per-horse via `HorseAssignment`

---

## Data model

Key entities: `User`, `Horse`, `HorseAssignment`, `Programme`, `ProgrammeVersion`, `PlanBlock`, `PlannedSession`, `ActualSessionLog`, `SessionAuditLog`, `AppliedPlan`, `Workout`, `PlanShare`, `VetVisit`, `FarrierVisit`, `VaccinationRecord`, `ExpenseNote`.

See `backend/prisma/schema.prisma` for the full schema.

---

## Programme Upload (Trainer Guide)

Trainers can upload structured training programmes as a **ZIP package** containing a schedule CSV and a reference manual.

### ZIP Package Structure

```
my-programme.zip
├── schedule.csv      (required)
└── manual.html       (required — or manual.pdf)
```

**Upload limits:** ZIP file max 10 MB. Only `.csv`, `.html`, `.htm`, `.pdf`, `.txt`, `.md` files are allowed inside the ZIP.

### schedule.csv Format

The CSV defines the daily training schedule. Each week must have exactly 7 day entries (days 1–7), including rest days.

**Required columns:** `week`, `day`, `title`, `category`

**Optional columns:** `duration_min`, `duration_max`, `intensity_label`, `intensity_rpe_min`, `intensity_rpe_max`, `blocks`, `substitution`, `manual_ref`

Column names are case-insensitive and may use spaces or hyphens (e.g. `Duration Min` → `duration_min`).

### CSV Template

```csv
week,day,title,category,duration_min,duration_max,intensity_label,intensity_rpe_min,intensity_rpe_max,blocks,substitution,manual_ref
1,1,Flat work,training,30,45,Moderate,5,7,"Warm-up: 10 min walk | Main: 20 min trot | Cool-down: 5 min walk",,p.12
1,2,Jumping,training,40,50,Hard,7,9,,,
1,3,Rest,rest,,,,,,,,
1,4,Hack,training,60,,Light,3,4,,,
1,5,Lunging,training,20,25,,5,6,,,
1,6,Polo practice,training,45,60,Hard,8,9,"Warm-up: stick & ball | Match: 2 chukkas",,p.20
1,7,Recovery walk,recovery,15,,Light,2,3,,,
```

### Column Reference

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| `week` | Yes | integer ≥ 1 | Week number |
| `day` | Yes | integer 1–7 | Day of week (1 = Monday) |
| `title` | Yes | text | Session name (e.g. "Flat work", "Rest") |
| `category` | Yes | text | Category: `training`, `rest`, `recovery`, etc. |
| `duration_min` | No | integer | Minimum duration in minutes |
| `duration_max` | No | integer | Maximum duration in minutes |
| `intensity_label` | No | text | Label like "Light", "Moderate", "Hard" |
| `intensity_rpe_min` | No | integer 1–10 | Minimum RPE (rate of perceived exertion) |
| `intensity_rpe_max` | No | integer 1–10 | Maximum RPE |
| `blocks` | No | pipe-separated | Exercise blocks: `"Name: text \| Name: text"` |
| `substitution` | No | text | Alternative if conditions don't suit |
| `manual_ref` | No | text | Page reference in the manual (e.g. "p.12") |

### Blocks Format

The `blocks` column uses pipe-separated `Name: text` entries:

```
"Warm-up: 10 min walk | Main: 3×5 min canter | Cool-down: 10 min walk"
```

If the blocks column is empty, a single "Main" block is created from the title. Rest days get a "Rest" block.

### Rest Days

A day is considered a rest day if:
- The `category` is `rest` or `recovery` (case-insensitive), OR
- The `title` is `Rest` (case-insensitive)

Rest days must still be listed in the CSV (all 7 days per week are required).

### Workflow

1. **Upload** the ZIP via the Programmes page → creates a DRAFT version
2. **Publish** the draft → makes it available for assignment
3. **Apply** the published version to a horse with a start date
4. **View** the generated schedule in the Planner page
5. **Repeat** a completed programme (original or with amendments)
