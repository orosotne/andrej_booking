-- AlterTable: patient rok narodenia (povinný v aplikácii) + rodné číslo (dobrovoľné).
-- Oba stĺpce sú v DB nullable, takže existujúce záznamy zostanú platné; povinnosť
-- roku narodenia sa vynucuje vo validácii (patientCreateSchema), nie schémou.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "birth_year" INTEGER;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "national_id" TEXT;
