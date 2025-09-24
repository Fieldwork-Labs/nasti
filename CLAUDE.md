# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a Turborepo monorepo for NASTI (a field data collection application) with the following structure:

- **apps/web**: Main web application (React + TypeScript + Vite)
- **apps/pwa**: Progressive Web App for mobile use (React + TypeScript + Vite)
- **packages/ui**: Shared UI components built with Radix UI and Tailwind CSS
- **packages/common**: Shared utilities, hooks, and types
- **packages/eslint-config**: Shared ESLint configuration
- **packages/tailwind-config**: Shared Tailwind CSS configuration
- **packages/typescript-config**: Shared TypeScript configurations
- **supabase/**: Database schema, migrations, and edge functions

## Commands

Use these commands from the repository root:

### Development

- `pnpm dev`: Start all applications in development mode
- `pnpm dev --filter=@nasti/web`: Start only the web app
- `pnpm dev --filter=nasti-pwa`: Start only the PWA

### Building and Testing

- `pnpm build`: Build all packages and applications
- `pnpm lint`: Run ESLint across all packages
- `pnpm test`: Run tests across all packages
- `pnpm test --filter=nasti-pwa`: Run PWA tests only
- `pnpm test:coverage --filter=nasti-pwa`: Run PWA tests with coverage

### Supabase

- `supabase start`: Start local Supabase development environment
- `supabase stop`: Stop local Supabase
- `supabase db reset`: Reset local database with fresh migrations

## Architecture Overview

### Technology Stack

- **Frontend**: React 18/19 with TypeScript
- **Routing**: TanStack Router with file-based routing
- **State Management**: Zustand for global state, TanStack Query for server state
- **UI Framework**: Custom components built on Radix UI primitives
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Maps**: Mapbox GL JS with react-map-gl
- **Testing**: Vitest with React Testing Library (PWA only)

### Key Features

- Offline-first PWA with service worker caching
- Real-time data synchronization via Supabase
- File uploads with tus-js-client (resumable uploads)
- Geographic data collection and visualization
- Image proxy for external API integration (ALA - Atlas of Living Australia)
- Multi-tenant organization support

### Data Flow

- Both apps use TanStack Query for server state management
- PWA implements offline persistence using IndexedDB
- Real-time updates via Supabase subscriptions
- File uploads use Supabase storage with image transformation
- Geographic data uses PostGIS extensions

### Authentication & Authorization

- Supabase Auth with email/password
- Row Level Security (RLS) policies enforce data access
- Organization-based multi-tenancy
- User roles: admin, member with varying permissions

### Package Relationships

- `@nasti/common`: Shared hooks, types, and utilities used by both apps
- `@nasti/ui`: Component library with consistent styling and behavior
- Both apps extend base configurations from shared packages

## Important Conventions

### Code Style

- Use `Boolean(condition)` instead of `!!condition`
- No semicolons (configured in Prettier)
- Avoid `any` wherever possible. Use `unknown` where type is actually unknown. Attempt to type things properly wherever possible.
- Prefer `const` over `let` unless you need to reassign
- Tailwind CSS for all styling
- File-based routing with TanStack Router
- Before writing a useEffect hook, please read [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) in the React docs.

### Component Patterns

- Prefer composition over configuration in UI components
- Use custom hooks from `@nasti/common` for business logic
- Form handling with react-hook-form and Zod validation
- Consistent error boundaries and loading states

### Database Conventions

- Use Supabase functions for complex operations
- All user data is organization-scoped
- Geographic data stored as PostGIS POINT types
- Soft deletes for user-generated content

### Environment Configuration

Local development uses Supabase local development stack:

- API: http://127.0.0.1:57321
- DB: postgresql://postgres:postgres@127.0.0.1:57322/postgres
- Studio: http://127.0.0.1:57323
