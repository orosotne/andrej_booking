-- Vacation: a planned clinic closure spanning a date range. It owns the days it
-- closes via calendar_days.closed_by_vacation_id, so removing a vacation reopens
-- only its own days and never a holiday- or manually-closed one.

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacations_start_date_end_date_idx" ON "vacations"("start_date", "end_date");

-- AlterTable
ALTER TABLE "calendar_days" ADD COLUMN "closed_by_vacation_id" TEXT;

-- CreateIndex
CREATE INDEX "calendar_days_closed_by_vacation_id_idx" ON "calendar_days"("closed_by_vacation_id");

-- AddForeignKey
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_closed_by_vacation_id_fkey" FOREIGN KEY ("closed_by_vacation_id") REFERENCES "vacations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
