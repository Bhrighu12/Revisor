import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) {
    redirect("/admin/dashboard");
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Revisor Admin</h1>
          <p className="mt-1 text-sm text-slate-500">Super admin sign in</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/" className="underline underline-offset-2 hover:text-slate-600">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
