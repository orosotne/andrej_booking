# Ambulantný objednávkový systém — Design Spec

> Stav: schválený 2026-05-31. Zdroj pravdy pre architektúru a MVP rozsah.

## 1. Cieľ a problém

Interný objednávkový systém pre ambulanciu (lekár + sestra + admin). Pacienti sa
objednávajú na konkrétny deň a čas. Ambulancia funguje **štvrtok a piatok**,
výnimočne **jedna streda v mesiaci** (manuálne otvorená).

**Jadrový problém:** nesmie sa vybookovať príliš veľa termínov dopredu. Časť
kapacity musí ostať chránená pre akútnych pacientov. Riešením sú **pravidlá
otvárania slotov** (`release_policies`) — termíny sa sprístupňujú postupne, nie
všetky naraz.

## 2. Locked rozhodnutia

| Oblasť | Voľba |
|---|---|
| Stack | Next.js (App Router) full-stack + Prisma + PostgreSQL |
| Auth | Auth.js (next-auth v5) credentials + TOTP 2FA, argon2 hash |
| Hosting/DB | Vercel + Neon Postgres (EU/Frankfurt), PITR + denné zálohy |
| Pravidlá | konfigurovateľné v DB (`release_policies`, `slot_rules`, `settings`), nie hardcoded |
| ACUTE_RESERVE | riešené ako `slot_rule` s DAYS_BEFORE(7), admin override cez /unlock |
| Citlivé polia pacienta | defaultne vypnuté (data minimization), zapínateľné v settings |

## 3. Architektúra

Klient (RSC + client komponenty) → Next.js Route Handlers (tenké, Zod validácia
+ auth) → **service layer** (`lib/`, framework-agnostic) → Prisma → Postgres.
Vercel Cron volá denný release/generate job.

**Princíp:** všetka business logika je v `lib/` a nezávisí od Next.js. To
umožňuje neskoršiu extrakciu do samostatného backendu (NestJS/Fastify) bez
prepisovania logiky — "minimal implementation that can scale".

```
lib/
  slot-engine/      generateDay(), computeReleaseAt(), releaseDueSlots()
  booking/          bookSlot(), reschedule(), cancel()  (transakčné)
  audit/            recordAudit()
  auth/             Auth.js config, requireRole()
  settings/         cached get/set
app/api/            tenké route handlers
app/(app)/          kalendár UI (week/month/day), admin panel
components/         SlotCard, BookingDialog, PatientSearch, ...
```

## 4. Dátový model (Postgres + Prisma)

10 tabuliek podľa zadania. Spresnenia:

- **Enums:** `Role(ADMIN|DOCTOR|NURSE)`, `DayType`, `SlotStatus(LOCKED|AVAILABLE|BOOKED|BLOCKED|CANCELLED|COMPLETED)`,
  `AppointmentType(PRE_HOSPITAL|CONSULTATION_BLOCKED|DISPENSARY|ECHO|ACUTE_RESERVE|CUSTOM)`,
  `AppointmentStatus(SCHEDULED|ARRIVED|NO_SHOW|CANCELLED|RESCHEDULED|COMPLETED)`,
  `ReleaseType(IMMEDIATE|DAYS_BEFORE|MANUAL_ONLY|LAST_FRIDAY_30_DAYS_BEFORE)`.
- **appointments:** partial unique index `(slot_id) WHERE status NOT IN ('CANCELLED','RESCHEDULED')`
  — DB-level ochrana proti dvojitému bookingu.
- **appointment_slots:** index `(release_at, status)` (cron release), `(calendar_day_id, start_at)`.
- **audit_logs:** append-only, `before_data`/`after_data` ako `jsonb`.
- **settings:** `value` ako `jsonb`.
- Časy slotov `timestamptz`; `schedule_templates.start/end` ako `time`.
- Citlivé polia (rodné číslo, diagnóza) NIE sú v základnej schéme.

## 5. Slot release engine (jadro)

Pravidlá sú dáta. `computeReleaseAt(slotDate, policy, isLastFriday)` je čistá funkcia:

| ReleaseType | release_at | Default |
|---|---|---|
| IMMEDIATE | now | — |
| DAYS_BEFORE(n) | slotDate − n dní @ 06:00 | DISPENSARY=42, ECHO=28, PRE_HOSPITAL=63, ACUTE_RESERVE=7 |
| MANUAL_ONLY | null (LOCKED kým admin neodomkne) | stredy |
| LAST_FRIDAY_30_DAYS_BEFORE | slotDate − 30 dní (len ak posledný piatok) | celý posledný piatok |

- `CONSULTATION_BLOCKED` (08–09 poradňa) → vždy `BLOCKED`, neobjednateľné.
- Počiatočný stav pri generovaní: `BLOCKED` (poradňa), inak `AVAILABLE` ak
  `release_at <= now`, inak `LOCKED`.
- Cron `releaseDueSlots()`: `UPDATE ... SET status='AVAILABLE' WHERE status='LOCKED'
  AND release_at <= now() AND appointment_type <> 'CONSULTATION_BLOCKED'`.
- `generateForward(12m)`: dogeneruje chýbajúce Thu/Fri, väčšina ostáva LOCKED.

### Denná šablóna (Thu/Fri)

| Čas | Typ | Farba | Objednateľné |
|---|---|---|---|
| 07:00–08:00 (2×30m) | PRE_HOSPITAL | bledoružová | áno (release 63d) |
| 08:00–09:00 (2×30m) | CONSULTATION_BLOCKED | sivá | nie (BLOCKED) |
| 09:00–12:30 (7×30m) | DISPENSARY | biela | áno (release 42d) |
| 12:30–14:30 (4×30m) | ECHO | svetlomodrá | áno, len ECHO (release 28d) |
| 14:30–15:30 (2×30m) | DISPENSARY/ACUTE_RESERVE | biela/oranžová | áno (rezerva release 7d) |
| 15:30–16:00 | voliteľný extra slot | — | settings flag |

## 6. API kontrakt

`GET /api/calendar?from&to` · `POST /api/calendar-days/:date/generate` ·
`POST /api/calendar-days/:date/open` (streda; kontrola "už otvorená v mesiaci") ·
`POST /api/calendar-days/:date/close` · `POST /api/slots/:id/book` (transakčné) ·
`PATCH /api/appointments/:id` · `POST /api/appointments/:id/cancel` ·
`POST /api/appointments/:id/reschedule` · `POST /api/slots/:id/unlock` (admin, dôvod) ·
`GET /api/patients?search` · `POST /api/patients` · `PATCH /api/patients/:id` ·
`GET /api/audit-logs` (admin) · `GET|PATCH /api/settings` (admin).

Všetky vstupy Zod-validované, všetky mutácie auditované, všetky chránené RBAC.

## 7. Booking flow (race-free)

```
TRANSACTION:
  UPDATE appointment_slots SET status='BOOKED'
    WHERE id=:id AND status='AVAILABLE'        -- atomický optimistic lock
  IF rowsAffected != 1 → ROLLBACK → 409
  assert(appointmentType == slot.appointmentType)   -- ECHO→len ECHO; poradňa→nikdy
  INSERT appointment                                -- partial unique index = 2. vrstva
  recordAudit(...)
COMMIT → revalidateTag('day:'+date)
```

## 8. Caching

MVP: TanStack Query (klient, staleTime ~30s) + Next cache tagy na read endpointoch
(`day:<date>`, `settings`); zápis → `revalidateTag`. Scale path (neimplementuje sa
teraz): Upstash Redis pre distribuovaný cache + rate limiting.

## 9. Bezpečnosť

Auth.js credentials (argon2) + TOTP 2FA · RBAC per-endpoint · audit každej mutácie
(actor, before/after, reason, IP, UA) · session timeout (krátky JWT + idle) ·
HTTPS + secure cookies · Zod na hraniciach · rate limit na /auth · data
minimization · retenčné nastavenia + export.

## 10. MVP rozsah (táto fáza)

Runnable foundation, poradie:
1. Scaffold Next.js + Tailwind + shadcn/ui, závislosti.
2. Prisma schéma + migrácia + partial unique index.
3. **slot-engine** s unit testami (TDD — najrizikovejšia logika).
4. Seed: users (admin/doctor/nurse), templates, slot_rules, release_policies,
   settings; generovanie pár týždňov Thu/Fri + ukážka stredy + posledný piatok.
5. Auth.js credentials + RBAC (2FA scaffold, dokončenie môže byť follow-up).
6. API routes: calendar, book, generate, open-wednesday, cancel, reschedule,
   unlock, patients, audit.
7. UI: week view + day detail + booking dialog, farebné sloty, lock stavy,
   responzívne (mobil = day view default).

Mimo tejto fázy (dokumentované, scale path): mesačný pohľad detailný, plné 2FA UX,
Redis cache, rate limiting, export/retencia UI, e2e testy.
