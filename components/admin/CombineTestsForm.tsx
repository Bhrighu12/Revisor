"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TestRow {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  _count: { questions: number };
}

const SUBJECT_LABELS: Record<string, string> = {
  GENERAL_AWARENESS: "General Awareness",
  ENGLISH: "English",
  MATHEMATICS: "Mathematics",
  REASONING: "Reasoning",
};

export default function CombineTestsForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]); // in click order
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);
  const [durationTouched, setDurationTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || tests !== null) return;
    (async () => {
      const res = await fetch("/api/admin/tests");
      const data = await res.json();
      if (res.ok) setTests(data.tests);
      else setError(data.error || "Could not load tests");
    })();
  }, [open, tests]);

  function toggle(t: TestRow) {
    setSelected((prev) => {
      const next = prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id];
      // Sensible defaults from the selection, unless the admin already chose.
      const chosen = (tests ?? []).filter((x) => next.includes(x.id));
      if (!subject && chosen.length > 0) setSubject(chosen[0].subject);
      if (!durationTouched) {
        setDuration(
          Math.min(300, Math.max(1, chosen.reduce((s, x) => s + x.durationMinutes, 0) || 30))
        );
      }
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError("Select at least one test to copy questions from");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tests/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subject: subject || (tests ?? []).find((t) => t.id === selected[0])?.subject,
          durationMinutes: duration,
          testIds: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not combine the tests");
        setLoading(false);
        return;
      }
      router.push(`/admin/tests/${data.test.id}`);
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-indigo-300 bg-indigo-50 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-100"
      >
        ⧉ Combine tests
      </button>
    );
  }

  const totalQuestions = (tests ?? [])
    .filter((t) => selected.includes(t.id))
    .reduce((s, t) => s + t._count.questions, 0);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-1 font-semibold text-slate-900">Combine tests</h3>
      <p className="mb-4 text-sm text-slate-500">
        Pick the tests to pull questions from — their questions are <strong>copied</strong> into
        a new test in the order you tick them. The originals are not changed.
      </p>

      {tests === null ? (
        <p className="text-sm text-slate-500">Loading tests…</p>
      ) : tests.length === 0 ? (
        <p className="text-sm text-slate-500">No tests to combine yet.</p>
      ) : (
        <div className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {tests.map((t) => {
            const pos = selected.indexOf(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  pos >= 0 ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={pos >= 0}
                  onChange={() => toggle(t)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">{t.title}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {SUBJECT_LABELS[t.subject]} · {t._count.questions} questions
                  </span>
                </span>
                {pos >= 0 && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {pos + 1}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">New test title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Grand Mock — July"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Section</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${inputCls} bg-white`}
            required
          >
            <option value="" disabled>
              Choose…
            </option>
            {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Timer (minutes)</label>
          <input
            type="number"
            min={1}
            max={300}
            value={duration}
            onChange={(e) => {
              setDuration(Number(e.target.value));
              setDurationTouched(true);
            }}
            className={inputCls}
            required
          />
        </div>
        <div className="flex items-end pb-2 text-sm text-slate-600">
          {selected.length > 0 && (
            <span>
              {selected.length} test{selected.length > 1 ? "s" : ""} · {totalQuestions} questions
            </span>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Combining…" : "Create combined test"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
