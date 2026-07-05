import Link from "next/link";
import StartForm from "@/components/StartForm";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Revisor</h1>
          <p className="mt-2 text-slate-600">
            AFCAT practice tests — General Awareness, English, Mathematics &amp; Reasoning
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Take a test</h2>
          <p className="mb-5 text-sm text-slate-500">
            Enter the access code you received and your name to begin.
          </p>
          <StartForm />
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/admin" className="hover:text-slate-600 underline underline-offset-2">
            Admin login
          </Link>
        </p>
      </div>
    </main>
  );
}
