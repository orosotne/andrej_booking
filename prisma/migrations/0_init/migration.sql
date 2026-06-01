-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'NURSE');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('REGULAR_THURSDAY', 'REGULAR_FRIDAY', 'MANUAL_WEDNESDAY', 'LAST_FRIDAY', 'CLOSED');

-- CreateEnum
CREATE TYPE "CalendarDayStatus" AS ENUM ('CLOSED', 'GENERATED', 'OPEN', 'PARTIALLY_LOCKED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'BOOKED', 'BLOCKED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('PRE_HOSPITAL', 'CONSULTATION_BLOCKED', 'DISPENSARY', 'ECHO', 'ACUTE_RESERVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('IMMEDIATE', 'DAYS_BEFORE', 'MANUAL_ONLY', 'LAST_FRIDAY_30_DAYS_BEFORE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'NURSE',
    "password_hash" TEXT,
    "external_auth_id" TEXT,
    "totp_secret" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "external_patient_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATE,
    "valid_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_rules" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "appointment_type" "AppointmentType" NOT NULL,
    "color" TEXT NOT NULL,
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "release_policy_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "release_type" "ReleaseType" NOT NULL,
    "days_before" INTEGER,
    "requires_admin_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "day_type" "DayType" NOT NULL,
    "status" "CalendarDayStatus" NOT NULL DEFAULT 'CLOSED',
    "opened_by_user_id" TEXT,
    "opened_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_slots" (
    "id" TEXT NOT NULL,
    "calendar_day_id" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "appointment_type" "AppointmentType" NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'LOCKED',
    "release_at" TIMESTAMPTZ(6),
    "color" TEXT NOT NULL,
    "rule_id" TEXT,
    "locked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patients_last_name_first_name_idx" ON "patients"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "schedule_templates_day_of_week_is_active_idx" ON "schedule_templates"("day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "slot_rules_template_id_idx" ON "slot_rules"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_date_key" ON "calendar_days"("date");

-- CreateIndex
CREATE INDEX "calendar_days_date_idx" ON "calendar_days"("date");

-- CreateIndex
CREATE INDEX "appointment_slots_release_at_status_idx" ON "appointment_slots"("release_at", "status");

-- CreateIndex
CREATE INDEX "appointment_slots_start_at_idx" ON "appointment_slots"("start_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slots_calendar_day_id_start_at_key" ON "appointment_slots"("calendar_day_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_slot_id_idx" ON "appointments"("slot_id");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- AddForeignKey
ALTER TABLE "slot_rules" ADD CONSTRAINT "slot_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_rules" ADD CONSTRAINT "slot_rules_release_policy_id_fkey" FOREIGN KEY ("release_policy_id") REFERENCES "release_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_calendar_day_id_fkey" FOREIGN KEY ("calendar_day_id") REFERENCES "calendar_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one active appointment per slot (DB-level double-booking guard;
-- not expressible in the Prisma schema, hence a manual partial unique index).
CREATE UNIQUE INDEX "active_appointment_per_slot" ON "appointments" ("slot_id") WHERE "status" NOT IN ('CANCELLED', 'RESCHEDULED');
