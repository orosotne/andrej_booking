# Ambulance Booking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runnable foundation of an internal ambulance booking system with a configurable slot-release engine, race-free booking, RBAC auth, audit log, and a color-coded responsive calendar.

**Architecture:** Next.js (App Router) full-stack. Business logic in framework-agnostic `lib/` service layer; thin Route Handlers; Prisma + Postgres (Neon EU). Slot-release rules are data in the DB, not code.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6, PostgreSQL (Neon), Auth.js v5, Tailwind + shadcn/ui, TanStack Query, Zod, Vitest, argon2, otpauth.

---

## File Structure

```
prisma/
  schema.prisma              # 10 tables + enums + partial unique index
  seed.ts                    # users, templates, rules, policies, settings, generated days
src/
  lib/
    db.ts                    # Prisma client singleton
    slot-engine/
      release-rules.ts       # computeReleaseAt() — PURE
      template.ts            # DEFAULT_TEMPLATE blocks -> slot definitions — PURE
      generate.ts            # generateDay(), generateForward() — DB
      release.ts             # releaseDueSlots(), openLastFridaysDue() — DB
      index.ts
    booking/
      booking-service.ts     # bookSlot(), cancel(), reschedule() — transactional
    audit/audit.ts           # recordAudit()
    auth/
      auth.ts                # Auth.js config (credentials)
      rbac.ts                # requireRole(), getSession()
      password.ts            # argon2 hash/verify
    settings/settings.ts     # cached get/set
    calendar-date.ts         # isLastFridayOfMonth(), nthWeekday helpers — PURE
    validation.ts            # Zod schemas
  app/
    api/                     # route handlers (see Task 6)
    (auth)/login/page.tsx
    (app)/layout.tsx
    (app)/calendar/page.tsx  # week view (default)
    (app)/day/[date]/page.tsx
  components/
    calendar/WeekView.tsx, DayView.tsx, SlotCard.tsx, slot-style.ts
    booking/BookingDialog.tsx, PatientSearch.tsx
    ui/...                   # shadcn primitives
  hooks/useCalendar.ts
tests/
  release-rules.test.ts, template.test.ts, calendar-date.test.ts, booking.test.ts
```

---

## Task 1: Scaffold + tooling

**Files:** project root.

- [ ] Scaffold: `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --use-npm --no-import-alias` (alias `@/*` kept by default).
- [ ] Install: `npm i @prisma/client zod next-auth@beta @auth/prisma-adapter argon2 otpauth qrcode @tanstack/react-query date-fns clsx tailwind-merge`
- [ ] Install dev: `npm i -D prisma vitest @types/qrcode tsx`
- [ ] Add `vitest.config.ts` (node env) + `"test": "vitest run"`, `"db:seed": "tsx prisma/seed.ts"`, `"db:push": "prisma db push"` scripts.
- [ ] `.env.example` with `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`. Commit.

## Task 2: Prisma schema (foundation)

**Files:** Create `prisma/schema.prisma`, `src/lib/db.ts`.

- [ ] Write full schema (enums + 10 models). Key points: `appointment_slots.start_at/end_at` `DateTime @db.Timestamptz`; `audit_logs.before_data/after_data Json?`; `settings.value Json`. Add partial unique index for active appointments via raw migration (Prisma can't express partial unique natively):
  - After `prisma migrate dev`, add SQL: `CREATE UNIQUE INDEX active_appointment_per_slot ON appointments (slot_id) WHERE status NOT IN ('CANCELLED','RESCHEDULED');`
- [ ] `db.ts`: standard Prisma singleton (`globalThis` guard).
- [ ] `npx prisma migrate dev --name init` (against Neon). Commit.

## Task 3: Pure date + template helpers (TDD)

**Files:** Create `src/lib/calendar-date.ts`, `src/lib/slot-engine/template.ts`; Tests `tests/calendar-date.test.ts`, `tests/template.test.ts`.

- [ ] **Failing test** `calendar-date.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isLastFridayOfMonth, isNthWednesday } from '@/lib/calendar-date'
describe('isLastFridayOfMonth', () => {
  it('true for 2026-05-29 (last Fri of May)', () =>
    expect(isLastFridayOfMonth(new Date('2026-05-29'))).toBe(true))
  it('false for 2026-05-22 (not last Fri)', () =>
    expect(isLastFridayOfMonth(new Date('2026-05-22'))).toBe(false))
  it('false for a Thursday', () =>
    expect(isLastFridayOfMonth(new Date('2026-05-28'))).toBe(false))
})
```
- [ ] Run `npm test` → FAIL. Implement `isLastFridayOfMonth` (Fri && date+7 in next month). Run → PASS. Commit.
- [ ] **Failing test** `template.test.ts`: `buildDayTemplate()` returns 17 default slots (2 pre-hosp, 2 blocked, 7 dispensary, 4 echo, 2 dispensary/reserve) with correct types & 30-min boundaries from 07:00 to 15:30; respects `extraLateSlot` flag (adds 15:30–16:00). Assert count, first/last times, and that 08:00 & 08:30 are `CONSULTATION_BLOCKED`, 12:30–14:30 are `ECHO`.
- [ ] Implement `template.ts` (block definitions → slot list). Run → PASS. Commit.

## Task 4: Release rules (TDD — highest risk)

**Files:** Create `src/lib/slot-engine/release-rules.ts`; Test `tests/release-rules.test.ts`.

- [ ] **Failing test**:
```ts
import { computeReleaseAt } from '@/lib/slot-engine/release-rules'
const day = new Date('2026-07-03T00:00:00Z') // a Friday
it('DAYS_BEFORE 42 -> 42 days before at 06:00', () => {
  const r = computeReleaseAt(day, { type:'DAYS_BEFORE', daysBefore:42 }, false)!
  expect(r.toISOString().slice(0,10)).toBe('2026-05-22')
})
it('MANUAL_ONLY -> null', () =>
  expect(computeReleaseAt(day, { type:'MANUAL_ONLY' }, false)).toBeNull())
it('IMMEDIATE -> <= now', () =>
  expect(computeReleaseAt(day, { type:'IMMEDIATE' }, false)!.getTime()).toBeLessThanOrEqual(Date.now()))
it('LAST_FRIDAY only applies when isLastFriday', () => {
  expect(computeReleaseAt(day, { type:'LAST_FRIDAY_30_DAYS_BEFORE' }, false)).toBeNull()
  const lf = new Date('2026-07-31T00:00:00Z')
  expect(computeReleaseAt(lf, { type:'LAST_FRIDAY_30_DAYS_BEFORE' }, true)!.toISOString().slice(0,10)).toBe('2026-07-01')
})
```
- [ ] Run → FAIL. Implement pure `computeReleaseAt`. Run → PASS. Commit.
- [ ] Add `initialSlotStatus(type, releaseAt, now)` → BLOCKED for CONSULTATION_BLOCKED; AVAILABLE if releaseAt && releaseAt<=now; else LOCKED. Test 3 cases. Commit.

## Task 5: Generation + release (DB)

**Files:** Create `src/lib/slot-engine/generate.ts`, `release.ts`, `index.ts`; Test `tests/booking.test.ts` (shared DB test setup, can be skipped in CI without DB via guard).

- [ ] `generateDay(date, tx)`: resolve template + slot_rules + policies → upsert calendar_day → create slots with computed `release_at`, `color`, initial status. Idempotent (skip if day already has slots).
- [ ] `generateForward(months=12)`: for each Thu/Fri without a calendar_day in range, call generateDay.
- [ ] `releaseDueSlots()`: single `updateMany` LOCKED→AVAILABLE where release_at<=now and type<>CONSULTATION_BLOCKED.
- [ ] Commit.

## Task 6: Service layer — booking (transactional)

**Files:** Create `src/lib/booking/booking-service.ts`, `src/lib/audit/audit.ts`, `src/lib/validation.ts`.

- [ ] `bookSlot({slotId, patientId, type, note, actor})`: `prisma.$transaction`:
  - `updateMany` slot SET BOOKED WHERE id & status='AVAILABLE'; if count!=1 throw `ConflictError`.
  - load slot; assert `type === slot.appointmentType` (ECHO guard; CONSULTATION_BLOCKED never reaches AVAILABLE) else throw `ValidationError`.
  - create appointment (SCHEDULED); recordAudit('appointment','create').
- [ ] `cancel({id, reason, actor})`: set appointment CANCELLED + reason, slot → AVAILABLE (if future) / keep; audit.
- [ ] `reschedule({id, newSlotId, actor})`: transaction — book new (reuse guard), mark old appointment RESCHEDULED, free old slot; audit.
- [ ] Zod schemas in `validation.ts`. Commit.

## Task 7: Auth + RBAC

**Files:** Create `src/lib/auth/{auth.ts,rbac.ts,password.ts}`, `src/app/(auth)/login/page.tsx`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`.

- [ ] **Check Auth.js v5 docs (context7)** before writing — v5 API differs from v4.
- [ ] Credentials provider: lookup user by email, `argon2.verify`, return {id,role,name}. JWT session, short maxAge + idle. `requireRole(roles)` helper reads session in route handlers.
- [ ] Login page (email+password). 2FA: scaffold TOTP enroll/verify behind a setting; full UX is follow-up.
- [ ] Commit.

## Task 8: API route handlers (thin)

**Files:** Create handlers under `src/app/api/` per §6 of spec. Each: parse+Zod, `requireRole`, call service, map errors (Conflict→409, Validation→400, Unauthorized→401/403), `revalidateTag`.

- [ ] calendar GET; calendar-days generate/open/close; slots book/unlock; appointments PATCH/cancel/reschedule; patients GET/POST/PATCH; audit-logs GET; settings GET/PATCH.
- [ ] `open` (Wednesday): check no other open Wednesday in month (unless admin override+reason→audit); generate slots.
- [ ] `POST /api/cron/release` guarded by `CRON_SECRET`; `vercel.json` cron daily 02:00. Commit.

## Task 9: Calendar UI (responsive)

**Files:** Create `src/components/calendar/{WeekView,DayView,SlotCard,slot-style.ts}`, `src/components/booking/{BookingDialog,PatientSearch}`, `src/hooks/useCalendar.ts`, pages.

- [ ] `slot-style.ts`: map (type,status) → Tailwind classes (pink/grey/blue/white/orange/green + booked badge + lock icon).
- [ ] WeekView: Thu/Fri (+open Wed) columns, 30-min rows, color slots, lock icon + release date tooltip on LOCKED. Mobile → stacked single-day (DayView default).
- [ ] DayView: list 07:00–15:30, status, patient name, type, note, actions (book/cancel/reschedule). Type guard: ECHO slot → only ECHO; BLOCKED → no booking.
- [ ] BookingDialog: PatientSearch typeahead (GET /patients?search) + quick create + confirm; clear success toast; wrong-type warning.
- [ ] TanStack Query provider; `useCalendar(from,to)`; invalidate on mutations.
- [ ] Commit.

## Task 10: Verify

- [ ] `npm test` all pass (engine logic).
- [ ] `npx tsc --noEmit` clean.
- [ ] With Neon `DATABASE_URL`: `prisma migrate dev` + `npm run db:seed`, `npm run dev`, log in as nurse, book a slot, observe LOCKED vs AVAILABLE, open a Wednesday, verify last-Friday lock. Document any parts not verifiable without DB.

---

## Self-Review (vs spec)

- **Coverage:** roles/RBAC (T7), all endpoints (T8), slot states + release_at (T4/T5), 6 release-policy behaviors (T4), last-Friday & Wednesday rules (T4/T8), double-booking prevention (T2 index + T6 tx), audit (T6/T8), color UI + lock display (T9), patient min-fields (T2), seed (Task in T2/T5+seed), responsive (T9), settings-driven rules (T2 seed + T8 settings). ✓
- **Deferred (documented):** detailed month view, full 2FA UX, Redis cache, rate limiting, export/retention UI, e2e. Matches spec §10.
- **Type consistency:** `computeReleaseAt`, `initialSlotStatus`, `generateDay`, `bookSlot`, `requireRole` names used consistently across tasks. ✓
- **Placeholders:** none — engine tasks carry real test code; API/UI tasks specify files+behavior precisely (full code written at implementation, not duplicated here). ✓
