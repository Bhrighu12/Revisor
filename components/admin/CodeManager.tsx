"use client";

import { useCallback, useEffect, useState } from "react";

interface TestOption {
  id: string;
  title: string;
  subject: string;
}

interface CodeRow {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  test: TestOption;
  _count: { attempts: number };
}

const SUBJECT_LABELS: Record<string, string> = {
  GENERAL_AWARENESS: "General Awareness",
  ENGLISH: "English",
  MATHEMATICS: "Mathematics",
  REASONING: "Reasoning",
};

export default function CodeManager() {
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [tests, setTests] = useState<TestOption[]>([]);
  const [error, setError] = useState("");

  const [testId, setTestId] = useState("");
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const [codesRes, testsRes] = await Promise.all([
      fetch("/api/admin/codes"),
      fetch("/api/admin/tests"),
    ]);
    if (!codesRes.ok || !testsRes.ok) {
      setError("Could not load access codes");
      return;
    }
    const codesData = await codesRes.json();
    const testsData = await testsRes.json();
    setCodes(codesData.codes);
    setTests(testsData.tests);
    if (testsData.tests.length > 0) {
      setTestId((prev) => prev || testsData.tests[0].id);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCodes(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, label, count, maxUses }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Could not create codes");
      } else {
        setLabel("");
        load();
      }
    } catch {
      setCreateError("Network error — please try again");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(code: CodeRow) {
    await fetch(`/api/admin/codes/${code.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !code.isActive }),
    });
    load();
  }

  async function deleteCode(code: CodeRow) {
    if (!confirm(`Delete code ${code.code}? Attempts made with it will also be deleted.`)) return;
    await fetch(`/api/admin/codes/${code.id}`, { method: "DELETE" });
    load();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function shareLink(code: string) {
    return `${window.location.origin}/t/${code}`;
  }

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(shareLink(code));
      setCopied(`${code}:link`);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function shareOnWhatsApp(c: CodeRow) {
    const text =
      `Here's your ${c.test.title} practice test (${SUBJECT_LABELS[c.test.subject]}). ` +
      `Open this link and enter your name to start: ${shareLink(c.code)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</p>;
  }

  return (
    <main>
      <h1 className="text-2xl font-bold text-slate-900">Access codes</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Generate codes and share them with candidates. Use &quot;Copy link&quot; to get a
        shareable URL that pre-fills the code — the candidate only enters their name.
      </p>

      {/* Create form */}
      <form onSubmit={createCodes} className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">Generate codes</h2>
        {tests.length === 0 ? (
          <p className="text-sm text-slate-500">Create a test first, then generate codes for it.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Test</label>
                <select value={testId} onChange={(e) => setTestId(e.target.value)} className={`${inputCls} bg-white`}>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({SUBJECT_LABELS[t.subject]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">How many codes</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Uses per code</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Label (optional)</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Batch A — July"
                  className={inputCls}
                />
              </div>
            </div>
            {createError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {createError}
              </p>
            )}
            <button
              type="submit"
              disabled={creating}
              className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {creating ? "Generating…" : "Generate"}
            </button>
          </>
        )}
      </form>

      {/* Codes table */}
      {codes === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : codes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No codes yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Uses</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyCode(c.code)}
                      title="Copy code"
                      className="rounded-md bg-slate-100 px-2 py-1 font-mono font-semibold tracking-wider text-slate-800 hover:bg-slate-200"
                    >
                      {c.code}
                    </button>
                    {copied === c.code && (
                      <span className="ml-2 text-xs font-medium text-emerald-600">Copied!</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.test.title}
                    <span className="block text-xs text-slate-400">
                      {SUBJECT_LABELS[c.test.subject]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.label ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {c.usedCount} / {c.maxUses}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        !c.isActive
                          ? "bg-slate-100 text-slate-500"
                          : c.usedCount >= c.maxUses
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {!c.isActive ? "Disabled" : c.usedCount >= c.maxUses ? "Used up" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <button
                        onClick={() => copyLink(c.code)}
                        title={`Copy share link: /t/${c.code}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {copied === `${c.code}:link` ? "Link copied!" : "Copy link"}
                      </button>
                      <button
                        onClick={() => shareOnWhatsApp(c)}
                        title="Share the test link on WhatsApp"
                        className="font-medium text-emerald-600 hover:underline"
                      >
                        WhatsApp
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {c.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => deleteCode(c)}
                        className="font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
