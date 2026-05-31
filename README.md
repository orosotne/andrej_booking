# Ambulantný objednávkový systém

Interný objednávkový systém pre ambulanciu (lekár + sestra + admin). Pacienti sa
objednávajú na sloty po 30 minútach; jadrom je **konfigurovateľný engine
otvárania slotov**, ktorý chráni časť kapacity pre akútnych pacientov.

Stack: **Next.js 16** (App Router) · **Prisma 7** + **PostgreSQL** (Neon EU) ·
**Auth.js v5** (credentials + 2FA-ready) · **Tailwind v4** · **TanStack Query** ·
**Vitest**.

Dokumentácia návrhu: [`docs/superpowers/specs`](docs/superpowers/specs) a
[`docs/superpowers/plans`](docs/superpowers/plans).

## Lokálne spustenie

```bash
# 1. Závislosti
npm install

# 2. Env — skopíruj šablónu a doplň DATABASE_URL (Neon EU dev branch)
cp .env.example .env
#   AUTH_SECRET vygeneruj: openssl rand -base64 32

# 3. Databáza — schéma + seed (vytvorí používateľov, šablóny, pravidlá,
#    vygeneruje 3 mesiace štvrtkov/piatkov + ukážkovú stredu)
npm run db:setup        # = prisma db push && seed

# 4. Dev server
npm run dev             # http://localhost:3000
```

### Demo prihlásenia (zo seedu)

| Rola  | E-mail                  | Heslo      |
| ----- | ----------------------- | ---------- |
| Admin | admin@ambulancia.sk     | admin123   |
| Lekár | lekar@ambulancia.sk     | lekar123   |
| Sestra| sestra@ambulancia.sk    | sestra123  |

> Heslá zmeň pred produkciou. AUTH_SECRET a CRON_SECRET musia byť silné a tajné.

## Skripty

| Príkaz             | Účel                                            |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Vývojový server                                 |
| `npm run build`    | Produkčný build                                 |
| `npm test`         | Unit testy (slot engine, release pravidlá, TZ)  |
| `npm run db:push`  | Synchronizácia schémy do DB                     |
| `npm run db:seed`  | Naplnenie seed dátami                           |
| `npm run db:setup` | push + seed                                     |

## Engine otvárania slotov

Pravidlá sú **dáta v DB** (`release_policies`, `slot_rules`, `settings`), nie
hardcoded. `release_at` počíta čistá funkcia `computeReleaseAt`:

| Politika                     | Otvorenie                       | Default       |
| ---------------------------- | ------------------------------- | ------------- |
| `IMMEDIATE`                  | hneď                            | —             |
| `DAYS_BEFORE(n)`             | n dní pred dňom                 | disp. 42, ECHO 28, predhosp. 63, rezerva 7 |
| `MANUAL_ONLY`                | nikdy (kým admin neodomkne)     | stredy        |
| `LAST_FRIDAY_30_DAYS_BEFORE` | 30 dní pred posledným piatkom   | posledný piatok |

Denný cron (`/api/cron/release`, Vercel Cron 02:00) otvára sloty, ktorým prišiel
`release_at`, a dogeneruje dni dopredu.

## Produkcia (Vercel + Neon EU)

1. Neon projekt v EÚ regióne (Frankfurt), **pooled** connection string do `DATABASE_URL`.
2. Na Verceli nastav `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `CLINIC_TIMEZONE`.
3. `vercel.json` už definuje cron a región `fra1`. Cron volá endpoint s `Bearer $CRON_SECRET`.
4. `prisma migrate deploy` (alebo `db push`) pri deployi; `postinstall` generuje klienta.
