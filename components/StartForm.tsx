"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      router.push(`/test/${data.attemptId}`);
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1">
          Access code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7M2XQ"
          autoComplete="off"
          autoCapitalize="characters"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-lg tracking-widest uppercase placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:normal-case focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          required
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          maxLength={80}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          required
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "Starting…" : "Start test"}
      </button>
    </form>
  );
}
