# Správa používateľov v admin rozhraní

**Dátum:** 2026-06-03
**Stav:** schválený dizajn → implementácia

## Cieľ

Admin dostane stránku `/pouzivatelia` na plnú správu používateľov: vytváranie
(vrátane dočasných „zaskakujúcich" účtov), generovanie a zmena hesla,
aktivácia/deaktivácia, nastavenie roly a dátumu platnosti. Všetko auditované.

**Motivácia:** keď stála sestra nie je v práci (dovolenka) a zaskakuje za ňu
náhodná osoba, admin potrebuje rýchlo vygenerovať dočasný prístup s heslom a mať
v audite dohľadateľné, kto čo robil.

**Interpretácia „jednorazový účet":** dočasný účet s dátumom expirácie
(`expiresAt`), nie doslova single-login. Single-login je mimo rozsah (YAGNI).

## Dátový model + migrácia

Pridať do `User` jediné nové pole:

- `expiresAt DateTime?` — `null` = trvalý účet; nastavený dátum = po ňom sa nedá
  prihlásiť. „Dočasný účet" = používateľ s vyplneným `expiresAt`.

Žiadny zvlášť `isTemporary` flag — `expiresAt != null` to pokrýva. Kto účet
vytvoril, zachytáva audit log (`actor`).

⚠️ Migrácia beží proti zdieľanej Neon DB (lokál aj prod = tá istá DB). Je to
aditívny nullable stĺpec — bezpečný, bez straty dát — ale mení schému prod DB.
Spustiť `prisma migrate` až po výslovnom súhlase používateľa.

`expiresAt` sa z UI zadáva ako dátum (YYYY-MM-DD) a ukladá ako koniec daného dňa
v klinickom čase (Europe/Bratislava), aby účet platil celý zvolený deň.

## Prihlasovanie — kontrola expirácie

V `src/lib/auth/auth.ts` k existujúcej podmienke pridať expiry check (read-only,
žiadny zápis v auth ceste):

```ts
if (!user || !user.isActive || !user.passwordHash) return null;
if (user.expiresAt && user.expiresAt <= new Date()) return null; // nové
```

## Generovanie hesla — čitateľná passfráza

Nový util `src/lib/auth/passphrase.ts`: 3 slová z kurátorovaného zoznamu (bez
diakritiky, ľahko diktovateľné) + 2-ciferné číslo, oddelené pomlčkou — napr.
`mesiac-ryba-okno-47`. Výber cez `crypto.randomInt` (kryptograficky bezpečné).
Heslo sa zobrazí iba raz po vygenerovaní, s tlačidlom Kopírovať.

## API routy (všetky ADMIN_ONLY)

- `GET /api/users` — zoznam; nikdy nevracia `passwordHash`/`totpSecret`.
- `POST /api/users` — `{ name, email, role, expiresAt? }`, auto-vygeneruje
  passfrázu, vráti ju raz v odpovedi na zobrazenie.
- `PATCH /api/users/[id]` — `{ name?, role?, isActive?, expiresAt? }`
  (`expiresAt: null` ruší platnosť).
- `POST /api/users/[id]/password` — reset: bez tela = vygeneruje passfrázu
  (vráti ju); s `{ password }` = nastaví zadané heslo. Vynuluje
  `failedLoginAttempts`/`lockedUntil`.
- `DELETE /api/users/[id]` — hard-delete len ak účet nemá naviazané záznamy
  (audit logy, vytvorené/zmenené objednávky, otvorené dni, zmenené nastavenia).
  Inak 400 „radšej deaktivuj" — rovnaká logika ako pri pacientoch.

## Bezpečnostné poistky

- Admin nemôže sám sebe deaktivovať / expirovať / zmazať účet ani znížiť rolu
  (anti-lockout).
- Nedá sa deaktivovať / zmazať / degradovať posledný aktívny ADMIN.

## Audit

`entityType: "user"`, akcie `create` / `update` / `password_reset` / `delete`.
Pred zápisom vždy odstrániť `passwordHash` a `totpSecret` zo snapshotov (whitelist
bezpečných polí). Plaintext heslo sa do auditu nikdy nedostane.

## UI — `/pouzivatelia` + `UsersManager.tsx`

Server komponent gating ako `nastavenia` (`getSessionUser` → redirect ak nie je
admin), načíta zoznam, podá klientovi. Klient v štýle `SettingsForm`:

- Tabuľka: Meno · E-mail · Rola · Stav (Aktívny / Neaktívny / Expirovaný /
  Platný do DD.MM.) · 2FA · akcie.
- „Pridať používateľa" → Modal (meno, e-mail, rola, voliteľný dátum platnosti) →
  po vytvorení panel s passfrázou + Kopírovať.
- Riadkové akcie: Resetovať heslo · Aktivovať/Deaktivovať · Upraviť · Zmazať
  (disabled s tooltipom, ak má naviazané záznamy).

## Navigácia + CLI

- Do `AdminMenu` pridať `{ href: "/pouzivatelia", label: "Používatelia" }`.
- `prisma/create-user.ts` ponechať na úvodný seed prvého admina; pre bežnú prácu
  ho nahrádza UI.
