import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertNewPatientSlotPassword } from "@/lib/auth/unlock-password";
import { bookSlot } from "@/lib/booking/booking-service";
import { bookSlotSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ALL_STAFF, body: bookSlotSchema },
  async ({ params, body, audit }) => {
    // Heslo prichádza až po odmietnutí s kódom NEW_PATIENT_SLOT; zlé heslo
    // skončí tu, ešte pred zápisom.
    if (body.newPatientPassword !== undefined) {
      assertNewPatientSlotPassword(body.newPatientPassword);
    }
    const appointment = await bookSlot({
      slotId: params.id,
      patientId: body.patientId,
      appointmentType: body.appointmentType,
      patientCategory: body.patientCategory,
      categoryReason: body.categoryReason,
      note: body.note,
      allowNewPatient: body.newPatientPassword !== undefined,
      ctx: audit,
    });
    return NextResponse.json({ appointment }, { status: 201 });
  },
);
