import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";

// Exports can grow to the whole patient/appointment history, so the CSV is
// STREAMED and the DB is read in bounded batches instead of loading every row
// into memory at once. The emitted bytes are identical to the previous
// in-memory build (BOM + header + rows joined by "\n", no trailing newline).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 1000;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(headers: string[], row: Record<string, unknown>): string {
  return headers.map((h) => csvCell(row[h])).join(",");
}

interface ExportShape {
  filename: string;
  headers: string[];
  fetchBatch: (skip: number) => Promise<Record<string, unknown>[]>;
}

function patientsExport(): ExportShape {
  return {
    filename: "pacienti.csv",
    headers: ["id", "priezvisko", "meno", "rok_narodenia", "rodne_cislo", "datum_narodenia", "telefon", "email", "interne_cislo"],
    // `id` tiebreaker makes the order of identically-named patients deterministic
    // (it was arbitrary before); the set of rows is unchanged.
    fetchBatch: async (skip) => {
      const rows = await prisma.patient.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
        skip,
        take: BATCH,
      });
      return rows.map((p) => ({
        id: p.id,
        priezvisko: p.lastName,
        meno: p.firstName,
        rok_narodenia: p.birthYear ?? "",
        rodne_cislo: p.nationalId ?? "",
        datum_narodenia: p.dateOfBirth?.toISOString().slice(0, 10) ?? "",
        telefon: p.phone,
        email: p.email,
        interne_cislo: p.externalPatientId,
      }));
    },
  };
}

function appointmentsExport(): ExportShape {
  return {
    filename: "objednavky.csv",
    headers: ["id", "pacient", "typ", "stav", "zaciatok", "poznamka", "dovod_zrusenia", "vytvorene"],
    fetchBatch: async (skip) => {
      const rows = await prisma.appointment.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: BATCH,
        include: { patient: true, slot: true },
      });
      return rows.map((a) => ({
        id: a.id,
        pacient: `${a.patient.lastName} ${a.patient.firstName}`,
        typ: a.appointmentType,
        stav: a.status,
        zaciatok: a.slot.startAt.toISOString(),
        poznamka: a.note,
        dovod_zrusenia: a.cancellationReason,
        vytvorene: a.createdAt.toISOString(),
      }));
    },
  };
}

export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req, audit }) => {
  const type = new URL(req.url).searchParams.get("type") ?? "appointments";
  const shape = type === "patients" ? patientsExport() : appointmentsExport();

  await recordAudit(prisma, {
    entityType: "export",
    entityId: type,
    action: "export",
    ctx: audit,
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(`﻿${shape.headers.join(",")}\n`)); // BOM → correct diacritics in Excel
      let skip = 0;
      let first = true;
      for (;;) {
        const rows = await shape.fetchBatch(skip);
        if (rows.length === 0) break;
        const chunk = rows.map((r) => csvRow(shape.headers, r)).join("\n");
        controller.enqueue(enc.encode((first ? "" : "\n") + chunk));
        first = false;
        skip += rows.length;
        if (rows.length < BATCH) break;
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${shape.filename}"`,
    },
  });
});
