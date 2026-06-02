import Image from "next/image";
import { redirect } from "next/navigation";
import logo from "@/assets/logo-02.png";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

export const metadata = { title: "Prihlásenie — Ambulancia" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        totp: String(formData.get("totp") ?? ""),
        redirectTo: "/calendar",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex justify-center">
          <Image
            src={logo}
            alt="Kardiologická ambulancia"
            width={234}
            height={56}
            priority
          />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          Ambulantný objednávkový systém
        </h1>
        <p className="mt-1 text-sm text-slate-500">Prihláste sa do systému</p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Nesprávny e-mail alebo heslo.
          </p>
        )}

        <form action={authenticate} className="mt-6 space-y-4">
          <Field
            label="E-mail"
            name="email"
            type="email"
            required
            autoComplete="username"
          />
          <Field
            label="Heslo"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <Field
            label="2FA kód"
            name="totp"
            hint="Vyplňte iba ak máte zapnuté dvojfaktorové overenie"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            placeholder="123456"
            className="font-mono tracking-widest"
          />
          <SubmitButton fullWidth>Prihlásiť sa</SubmitButton>
        </form>
      </div>
    </main>
  );
}
