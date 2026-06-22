# 🏗️ Construction CRM Backend (Node.js + Express + Prisma ORM)

This is the backend server for the Construction CRM system. It connects to a PostgreSQL database using Prisma ORM (with SQLite support for development).

## Stack

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL (via Prisma ORM)
- **Authentication**: JWT tokens with Bcrypt password hashing
- **File Storage**: Local uploads
- **Documents**: pdfmake (PDF) & xlsx (Excel)
- **Payments**: qrcode (QR generator)

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- PostgreSQL (optional, defaults to SQLite if DATABASE_URL is not set)

### Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the `/server` directory:
   ```env
   PORT=8000
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smeta_crm?schema=public"
   JWT_SECRET="smeta-ai-secret-key-change-in-production"
   ```
   *Note: If you don't have PostgreSQL, you can change the provider in `prisma/schema.prisma` to `sqlite` and use `file:./dev.db` as the DATABASE_URL.*

3. **Database Migration**:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

4. **Run Server**:
   - **Development**: `npm run dev` (watches TypeScript files)
   - **Production Build**: `npm run build && npm run start`

## API Routing Table

- **Auth**: `/api/auth`
  - `POST /register` — Register owner
  - `POST /login` — Login
  - `POST /refresh` — Session refresh
  - `GET /me` — Get profile

- **Projects**: `/api/crm-projects`
  - `GET /` — List projects
  - `POST /` — Create project
  - `GET /:id` — Details
  - `PUT /:id` — Update
  - `DELETE /:id` — Delete
  - `GET /:id/dashboard` — Analytical stats
  - `GET /:id/workers` — Get project workers list
  - `POST /:id/share` — Generate guest link token

- **Work Stages**: `/api/crm-stages`
  - `GET /project/:projectId` — Timelines Gantt
  - `POST /project/:projectId` — Add stage
  - `PUT /:id` — Edit stage inline
  - `DELETE /:id` — Delete stage

- **Payments**: `/api/crm-payments`
  - `GET /project/:projectId` — Payment schedule list with filter and calculations
  - `POST /project/:projectId` — Schedule payment
  - `POST /:id/confirm` — Confirm payment received
  - `DELETE /:id` — Delete payment

- **Photos**: `/api/crm-photos`
  - `GET /project/:projectId` — Fetch photo grid
  - `POST /project/:projectId` — Upload file metadata
  - `DELETE /:id` — Remove photo

- **Estimates**: `/api/crm-estimates`
  - `GET /project/:projectId` — Itemized estimate rows
  - `POST /project/:projectId` — Add item
  - `PUT /:id` — Edit item (done mark, assign workers, price)
  - `DELETE /:id` — Delete item
  - `GET /project/:projectId/export/excel` — Excel export
  - `GET /project/:projectId/export/pdf` — PDF export

- **Requests**: `/api/crm-requests`
  - `GET /project/:projectId` — Task list and filters
  - `POST /project/:projectId` — Add request
  - `PUT /:id` — Update status (Kanban movement)
  - `DELETE /:id` — Delete request

- **Client Guest Portal**: `/api/client-portal`
  - `GET /:token` — Verify token and get project details
  - `GET /:token/stages` — Get stages and comments
  - `GET /:token/payments` — Get payments and cash flows
  - `GET /:token/photos` — Get photos
  - `GET /:token/estimates` — Get current estimate
  - `POST /:token/stages/:stageId/comment` — Send stage feedback
