@AGENTS.md

# ⚠️ PRODUKCIA JE NAŽIVO — REÁLNI POUŽÍVATELIA A PACIENTI

Od **2026-06-04** je aplikácia v ostrej prevádzke. Pribúdajú **reálni pacienti**
(prvý reálny záznam: Danišová). Produkčná Neon DB obsahuje **skutočné dáta
pacientov** — nie testovacie.

**Preto od teraz mimoriadne opatrne:**

- **Žiadne zápisy ani deštruktívne operácie nad produkčnou DB bez výslovného
  súhlasu.** Žiadne `migrate reset`, `DELETE`, hromadné `UPDATE`, mazanie záznamov,
  ani „opravné" skripty proti prod DB bez potvrdenia. Čítanie len keď treba.
- **DB migrácie** sa púšťajú manuálne a uvážene (`prisma migrate deploy`) — nikdy
  nie automaticky v builde. Pred migráciou zváž dopad na existujúce dáta.
- **Každú zmenu najprv over** (typy, lint, dry-run) a až po potvrdení nasaď.
- Deploy ide manuálne cez `vercel --prod` — over, čo nasadzuješ.
- Pri pochybnostiach sa **opýtaj**, neimprovizuj. Lepšie sa raz spýtať než
  poškodiť reálne dáta.
