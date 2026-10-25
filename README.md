# Hilal Bilet Sistemi

Centralized examination ticket sales and automated OMR result management system.

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Python >= 3.11
- Docker + Docker Compose

## Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

3. Start infrastructure:

```bash
docker compose up -d
```

4. Run database migration:

```bash
cd apps/api
pnpm prisma:migrate
```

5. Start backend:

```bash
cd apps/api
pnpm start:dev
```

6. Start frontend:

```bash
cd apps/web
pnpm dev
```

7. Start OMR worker:

```bash
cd services/omr-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Health checks

- API: `GET http://localhost:3001/api/health`
- OMR worker: `GET http://localhost:8000/api/health`
- Frontend: `http://localhost:3000`

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm build
```
