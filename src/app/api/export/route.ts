import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], headers: string[]): string {
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")).join("\n");
  return `﻿${head}\n${body}`; // BOM → correct diacritics in Excel
}

export async function GET(req: Request) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const type = new URL(req.url).searchParams.get("type") ?? "appointments";

    let csv: string;
    let filename: string;

    if (type === "patients") {
      const rows = await prisma.patient.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      csv = toCsv(
        rows.map((p) => ({
          id: p.id,
          priezvisko: p.lastName,
          meno: p.firstName,
          datum_narodenia: p.dateOfBirth?.toISOString().slice(0, 10) ?? "",
          telefon: p.phone,
          email: p.email,
          interne_cislo: p.externalPatientId,
        })),
        ["id", "priezvisko", "meno", "datum_narodenia", "telefon", "email", "interne_cislo"],
      );
      filename = "pacienti.csv";
    } else {
      const rows = await prisma.appointment.findMany({
        orderBy: { createdAt: "desc" },
        include: { patient: true, slot: true },
      });
      csv = toCsv(
        rows.map((a) => ({
          id: a.id,
          pacient: `${a.patient.lastName} ${a.patient.firstName}`,
          typ: a.appointmentType,
          stav: a.status,
          zaciatok: a.slot.startAt.toISOString(),
          poznamka: a.note,
          dovod_zrusenia: a.cancellationReason,
          vytvorene: a.createdAt.toISOString(),
        })),
        ["id", "pacient", "typ", "stav", "zaciatok", "poznamka", "dovod_zrusenia", "vytvorene"],
      );
      filename = "objednavky.csv";
    }

    await recordAudit(prisma, {
      entityType: "export",
      entityId: type,
      action: "export",
      ctx: auditContext(req, user.id),
    });

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
