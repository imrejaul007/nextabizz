# NextaBizz

A modern B2B platform for restaurant inventory management, supplierRFQs, and order fulfillment built with Next.js 15, Supabase, and a microservices architecture.

## Architecture

This is a **pnpm monorepo** using Turborepo with the following structure:

```
nextabizz/
├── apps/
│   ├── web/              # Main Next.js application (B2B dashboard)
│   └── supplier-portal/  # Supplier-facing portal
├── packages/
│   ├── shared-types/     # Shared TypeScript types and Zod schemas
│   ├── webhook-sdk/      # Webhook handling SDK
│   └── rez-auth-client/  # REZ API authentication client
├── services/
│   ├── reorder-engine/   # Automated reorder suggestion service
│   ├── scoring-engine/   # Supplier/product scoring service
│   └── payment-settlement/ # Payment processing service
└── supabase/
    └── migrations/        # Database migrations
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.7
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Validation**: Zod
- **Monorepo**: Turborepo + pnpm Workspaces
- **API**: REST + Webhooks
- **Auth**: NextAuth.js + JWT

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Docker (for local Supabase)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start Supabase locally
npx supabase start

# Run migrations
npx supabase db push

# Start development servers
pnpm dev
```

### Environment Variables

See `.env.example` for all required environment variables.

## Apps

### Web App (`apps/web`)

Main B2B dashboard for:
- Order management
- Supplier RFQs
- Inventory catalog
- Signal monitoring
- Analytics

### Supplier Portal (`apps/supplier-portal`)

Supplier-facing application for:
- Order fulfillment
- Product management
- Invoice tracking

## Packages

### shared-types

Shared TypeScript types, Zod schemas, and API types used across all apps and services.

### webhook-sdk

SDK for handling incoming webhooks from:
- REZ Merchant
- RestoPapa
- Hotel PMS systems

### rez-auth-client

Authentication client for the REZ API.

## Services

### reorder-engine

Automated service that analyzes inventory levels and suggests reorders based on historical data and consumption patterns.

### scoring-engine

Service for scoring suppliers and products based on performance metrics, delivery times, and quality scores.

### payment-settlement

Handles payment processing, invoice generation, and settlement calculations.

## Scripts

```bash
pnpm build      # Build all packages and apps
pnpm dev        # Start all development servers
pnpm lint       # Lint all packages and apps
pnpm test       # Run all tests
```

## License

MIT
