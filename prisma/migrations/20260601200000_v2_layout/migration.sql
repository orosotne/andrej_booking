-- AlterEnum: add ECHO_DEPARTMENT_BLOCKED to AppointmentType
ALTER TYPE "AppointmentType" ADD VALUE IF NOT EXISTS 'ECHO_DEPARTMENT_BLOCKED';

-- CreateEnum: PatientCategory chosen at booking time
DO $$ BEGIN
  CREATE TYPE "PatientCategory" AS ENUM ('DISPENZAR', 'ECHO', 'PRVOVYSETRENIE', 'AKUTNE', 'INE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: per-rule slot duration (default 30, ECHO rules use 20)
ALTER TABLE "slot_rules" ADD COLUMN IF NOT EXISTS "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: patient category recorded on the appointment + reason for INE
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "patient_category" "PatientCategory";
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "category_reason" TEXT;
