# Hilal Bilet Sistemi — Architecture

## Overview

Hilal Bilet Sistemi is a centralized examination ticket sales and OMR result management platform. A single PostgreSQL database serves multiple branches. Each branch has managers and sellers with role-based access.

## Components

- **Web (`apps/web`)**: Next.js App Router frontend, TypeScript, Tailwind CSS, shadcn/ui. Azerbaijani-language admin dashboard.
- **API (`apps/api`)**: NestJS modular monolith, REST API under `/api`, Prisma ORM, PostgreSQL, Swagger/OpenAPI.
- **OMR worker (`services/omr-worker`)**: Separate Python FastAPI service using OpenCV, NumPy, PyMuPDF. Processes uploaded answer sheets asynchronously.
- **Shared (`packages/shared`)**: Common constants and types.
- **Infrastructure**: Docker Compose for PostgreSQL, Redis, MinIO. MinIO stores uploaded scans privately.

## Multi-branch data model

All sales, tickets, candidates, and results reference a branch and a seller. Permissions are enforced in the backend. Every sensitive action is auditable.

## OMR processing

1. Upload JPG/PNG/PDF scan.
2. Store privately in MinIO.
3. Enqueue BullMQ job (Redis).
4. OMR worker downloads, preprocesses, detects QR, corrects perspective, recognizes 150 bubbles (A-E), evaluates confidence.
5. Low-confidence answers go to manual review.
6. Approved results are published and lookup is available via secure QR token.

## Security principles

- No permissions only in frontend.
- Unpredictable QR identifiers; no personal data in QR payloads.
- Private scan storage.
- Environment-based secrets; no hardcoded credentials.
- Database transactions and idempotency for sales and scans.
