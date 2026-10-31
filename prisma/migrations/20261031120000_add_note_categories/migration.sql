-- "Poznámky": doctor-defined subcategories (e.g. PCSK9I, AR) and the patients
-- filed under them. The names are shown in red above the patient's note.
-- Additive, non-destructive: two new tables, no existing table or row changes.
-- Deleting a patient or a subcategory drops its links (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "note_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_note_categories" (
    "patient_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_note_categories_pkey" PRIMARY KEY ("patient_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "note_categories_name_key" ON "note_categories"("name");

-- CreateIndex
CREATE INDEX "patient_note_categories_category_id_idx" ON "patient_note_categories"("category_id");

-- AddForeignKey
ALTER TABLE "patient_note_categories" ADD CONSTRAINT "patient_note_categories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_note_categories" ADD CONSTRAINT "patient_note_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "note_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
