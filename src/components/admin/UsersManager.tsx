"use client";

import { useState } from "react";
import { Plus, KeyRound, Copy, Pencil, UserCheck, UserX, Trash2, Eye } from "lucide-react";
import type { AdminUserDTO } from "@/lib/api-types";
import { apiGet, apiSend } from "@/lib/client";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { todayIso } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";

const ROLES: Role[] = ["NURSE", "DOCTOR", "ADMIN"];

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; user: AdminUserDTO }
  | { kind: "reset"; user: AdminUserDTO }
  | { kind: "delete"; user: AdminUserDTO }
  | { kind: "reveal"; name: string; password: string }
  | { kind: "view"; name: string; password: string | null };

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function statusBadge(u: AdminUserDTO): { label: string; cls: string } {
  if (!u.isActive) return { label: "Neaktívny", cls: "bg-slate-100 text-slate-500" };
  if (u.expiresAt && u.expiresAt < todayIso())
    return { label: "Expirovaný", cls: "bg-red-50 text-red-700" };
  if (u.expiresAt)
    return { label: `Platný do ${ddmmyyyy(u.expiresAt)}`, cls: "bg-amber-50 text-amber-700" };
  return { label: "Aktívny", cls: "bg-emerald-50 text-emerald-700" };
}

export function UsersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserDTO[];
  currentUserId: string;
}) {
  const { busy, run } = useAsyncAction();
  const { toast } = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  async function refresh(): Promise<void> {
    try {
      const res = await apiGet<{ users: AdminUserDTO[] }>("/api/users");
      setUsers(res.users);
    } catch {
      toast("Nepodarilo sa načítať zoznam používateľov", "error");
    }
  }

  const close = () => setDialog({ kind: "none" });

  function toggleActive(u: AdminUserDTO) {
    run(() => apiSend(`/api/users/${u.id}`, "PATCH", { isActive: !u.isActive }), {
      success: u.isActive ? "Účet deaktivovaný" : "Účet aktivovaný",
      onDone: refresh,
    });
  }

  function revealPassword(u: AdminUserDTO) {
    run(async () => {
      const res = await apiSend<{ password: string | null }>(
        `/api/users/${u.id}/reveal-password`,
        "POST",
      );
      setDialog({ kind: "view", name: u.name, password: res.password });
    });
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast("Heslo skopírované", "success"),
      () => toast("Kopírovanie zlyhalo", "error"),
    );
  }

  // Shared by the desktop table row and the mobile card so both stay in sync.
  const userActions = (u: AdminUserDTO) => {
    const isSelf = u.id === currentUserId;
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "edit", user: u })}>
          <Pencil className="h-4 w-4" />
          Upraviť
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "reset", user: u })}>
          <KeyRound className="h-4 w-4" />
          Heslo
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => revealPassword(u)}>
          <Eye className="h-4 w-4" />
          Zobraziť heslo
        </Button>
        {!isSelf && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => toggleActive(u)}>
            {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {u.isActive ? "Deaktivovať" : "Aktivovať"}
          </Button>
        )}
      </>
    );
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Používatelia</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Správa prístupov. Dočasné (zaskakujúce) účty môžu mať dátum platnosti.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="h-4 w-4" />
          Pridať
        </Button>
      </div>

      {/* Desktop: full table */}
      <div className="mt-4 hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Meno</th>
              <th className="px-3 py-2 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">Rola</th>
              <th className="px-3 py-2 font-medium">Stav</th>
              <th className="px-3 py-2 font-medium">2FA</th>
              <th className="px-3 py-2 font-medium">Heslo zmenené</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u) => {
              const badge = statusBadge(u);
              return (
                <tr key={u.id} className="text-slate-700">
                  <td className="px-3 py-2 font-medium text-slate-900">{u.name}</td>
                  <td className="px-3 py-2 text-slate-500">{u.email}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{u.twoFactorEnabled ? "áno" : "—"}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {u.passwordChangedAt ? ddmmyyyy(u.passwordChangedAt.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">{userActions(u)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per user */}
      <ul className="mt-4 space-y-2 md:hidden">
        {users.map((u) => {
          const badge = statusBadge(u);
          return (
            <li key={u.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{u.name}</p>
                  <p className="truncate text-sm text-slate-500">{u.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span>{ROLE_LABEL[u.role]}</span>
                <span aria-hidden="true">·</span>
                <span>2FA: {u.twoFactorEnabled ? "áno" : "—"}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Heslo:{" "}
                  {u.passwordChangedAt
                    ? ddmmyyyy(u.passwordChangedAt.slice(0, 10))
                    : "—"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                {userActions(u)}
              </div>
            </li>
          );
        })}
      </ul>

      {dialog.kind === "create" && (
        <UserFormModal
          title="Nový používateľ"
          submitLabel="Vytvoriť používateľa"
          busy={busy}
          withPassword
          onClose={close}
          onSubmit={(form) =>
            run(async () => {
              const res = await apiSend<{ password: string | null }>("/api/users", "POST", {
                name: form.name,
                email: form.email,
                role: form.role,
                expiresAt: form.expiresAt || undefined,
                password: form.password,
              });
              await refresh();
              if (res.password) {
                setDialog({ kind: "reveal", name: form.name, password: res.password });
              } else {
                close();
                toast("Používateľ vytvorený", "success");
              }
            })
          }
        />
      )}

      {dialog.kind === "edit" && (
        <UserFormModal
          title="Upraviť používateľa"
          submitLabel="Uložiť"
          busy={busy}
          initial={dialog.user}
          emailReadOnly
          onClose={close}
          onDelete={() => setDialog({ kind: "delete", user: dialog.user })}
          onSubmit={(form) =>
            run(
              () =>
                apiSend(`/api/users/${dialog.user.id}`, "PATCH", {
                  name: form.name,
                  role: form.role,
                  expiresAt: form.expiresAt ? form.expiresAt : null,
                }),
              { success: "Zmeny uložené", onDone: () => { void refresh(); close(); } },
            )
          }
        />
      )}

      {dialog.kind === "reset" && (
        <ResetPasswordModal
          user={dialog.user}
          busy={busy}
          onClose={close}
          onSubmit={(password) =>
            run(async () => {
              const res = await apiSend<{ password: string | null }>(
                `/api/users/${dialog.user.id}/password`,
                "POST",
                password ? { password } : undefined,
              );
              await refresh();
              if (res.password) {
                setDialog({ kind: "reveal", name: dialog.user.name, password: res.password });
              } else {
                close();
                toast("Heslo nastavené", "success");
              }
            })
          }
        />
      )}

      {dialog.kind === "reveal" && (
        <Modal title="Heslo vygenerované" subtitle={dialog.name} onClose={close}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Heslo sa zobrazí len teraz. Odovzdajte ho používateľovi — neskôr ho
              nebude možné zobraziť, len resetovať.
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="font-mono text-base text-slate-900">{dialog.password}</code>
              <Button variant="outline" size="sm" onClick={() => copy(dialog.password)}>
                <Copy className="h-4 w-4" />
                Kopírovať
              </Button>
            </div>
            <Button fullWidth onClick={close}>
              Hotovo
            </Button>
          </div>
        </Modal>
      )}

      {dialog.kind === "view" && (
        <Modal title="Aktuálne heslo" subtitle={dialog.name} onClose={close}>
          <div className="space-y-3">
            {dialog.password ? (
              <>
                <p className="text-sm text-slate-600">
                  Aktuálne heslo používateľa. V databáze je uložené šifrovane;
                  zobrazenie je len pre teba (admin) a zaznamenané v audite.
                </p>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <code className="font-mono text-base text-slate-900">
                    {dialog.password}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(dialog.password as string)}
                  >
                    <Copy className="h-4 w-4" />
                    Kopírovať
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Heslo tohto účtu sa nedá zobraziť — bolo nastavené pred zavedením
                tejto funkcie alebo preň nie je uložená čitateľná kópia. Môžeš ho
                resetovať cez „Heslo“.
              </p>
            )}
            <Button fullWidth onClick={close}>
              Zavrieť
            </Button>
          </div>
        </Modal>
      )}

      {dialog.kind === "delete" && (
        <ConfirmDialog
          title="Zmazať používateľa?"
          description={`Natrvalo zmaže účet „${dialog.user.name}". Možné len ak nemá žiadnu históriu v systéme — inak ho radšej deaktivujte.`}
          confirmLabel="Zmazať"
          tone="danger"
          onConfirm={() =>
            run(() => apiSend(`/api/users/${dialog.user.id}`, "DELETE"), {
              success: "Používateľ zmazaný",
              onDone: () => { void refresh(); close(); },
            })
          }
          onClose={close}
        />
      )}
    </div>
  );
}

interface UserForm {
  name: string;
  email: string;
  role: Role;
  expiresAt: string;
  password?: string;
}

function UserFormModal({
  title,
  submitLabel,
  busy,
  initial,
  emailReadOnly,
  withPassword,
  onClose,
  onSubmit,
  onDelete,
}: {
  title: string;
  submitLabel: string;
  busy: boolean;
  initial?: AdminUserDTO;
  emailReadOnly?: boolean;
  withPassword?: boolean;
  onClose: () => void;
  onSubmit: (form: UserForm) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "NURSE");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const pw = password.trim();
  const pwTooShort = pw.length > 0 && pw.length < 8;
  const pwMismatch = confirm.length > 0 && pw !== confirm.trim();
  // A custom password is optional; when typed it must be valid and confirmed.
  const pwOk = !withPassword || pw.length === 0 || (pw.length >= 8 && pw === confirm.trim());

  const valid =
    name.trim().length > 0 &&
    (emailReadOnly || /\S+@\S+\.\S+/.test(email)) &&
    pwOk;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field
          label="Meno"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="E-mail"
          type="email"
          required
          value={email}
          readOnly={emailReadOnly}
          onChange={(e) => setEmail(e.target.value)}
          hint={emailReadOnly ? "E-mail (prihlasovacie meno) sa nedá zmeniť." : undefined}
          className={emailReadOnly ? "bg-slate-50 text-slate-500" : undefined}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700">Rola</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Platnosť do (nepovinné)"
          type="date"
          value={expiresAt}
          min={todayIso()}
          onChange={(e) => setExpiresAt(e.target.value)}
          hint="Prázdne = trvalý účet. Dátum = dočasný zaskakujúci prístup."
        />
        {withPassword && (
          <>
            <Field
              label="Heslo (nepovinné)"
              type="text"
              autoComplete="off"
              value={password}
              placeholder="Prázdne = vygenerovať"
              error={pwTooShort ? "Heslo musí mať aspoň 8 znakov" : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {pw.length > 0 && (
              <Field
                label="Zopakujte heslo"
                type="text"
                autoComplete="off"
                value={confirm}
                placeholder="to isté heslo znova"
                error={pwMismatch ? "Heslá sa nezhodujú" : undefined}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" fullWidth onClick={onClose}>
            Zrušiť
          </Button>
          <Button
            fullWidth
            loading={busy}
            disabled={!valid}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                email: email.trim(),
                role,
                expiresAt,
                password: withPassword && pw.length >= 8 ? pw : undefined,
              })
            }
          >
            {submitLabel}
          </Button>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1 pt-1 text-xs text-red-600 transition hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Zmazať účet natrvalo
          </button>
        )}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: AdminUserDTO;
  busy: boolean;
  onClose: () => void;
  onSubmit: (password?: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const trimmed = password.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 8;
  const longEnough = trimmed.length >= 8;
  const mismatch = confirm.length > 0 && trimmed !== confirm.trim();
  const canSet = longEnough && trimmed === confirm.trim();

  return (
    <Modal title="Resetovať heslo" subtitle={user.name} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Zadajte vlastné heslo (min. 8 znakov) dvakrát a kliknite „Nastaviť
          heslo“, alebo nechajte systém vygenerovať náhodné (zobrazí sa iba raz).
        </p>
        <Field
          label="Vlastné heslo"
          type="text"
          autoComplete="off"
          value={password}
          placeholder="aspoň 8 znakov"
          error={tooShort ? "Heslo musí mať aspoň 8 znakov" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Zopakujte heslo"
          type="text"
          autoComplete="off"
          value={confirm}
          placeholder="to isté heslo znova"
          error={mismatch ? "Heslá sa nezhodujú" : undefined}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            loading={busy}
            disabled={!canSet}
            onClick={() => onSubmit(trimmed)}
          >
            Nastaviť heslo
          </Button>
          <Button
            variant="outline"
            fullWidth
            disabled={busy}
            onClick={() => onSubmit(undefined)}
          >
            Vygenerovať náhodné heslo
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Zrušiť
          </Button>
        </div>
      </div>
    </Modal>
  );
}
