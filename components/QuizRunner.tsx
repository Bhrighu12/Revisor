"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClock } from "@/lib/utils";

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
}

interface AttemptData {
  status: "IN_PROGRESS" | "SUBMITTED";
  candidateName: string;
  test: {
    title: string;
    subjectLabel: string;
    durationMinutes: number;
  };
  startedAt: string;
  serverNow: string;
  questions: QuizQuestion[];
  savedAnswers: {
    questionId: string;
    selectedIndex: number | null;
    timeTakenSeconds: number;
  }[];
}

export default function QuizRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [data, setData] = useState<AttemptData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Accumulated seconds per question, plus when the current question was opened.
  const timeSpentRef = useRef<Record<string, number>>({});
  const enteredAtRef = useRef<number>(Date.now());
  const deadlineRef = useRef<number>(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/attempts/${attemptId}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body.error || "Could not load the test");
          return;
        }
        if (body.status === "SUBMITTED") {
          router.replace(`/result/${attemptId}`);
          return;
        }
        const d = body as AttemptData;
        const initial: Record<string, number | null> = {};
        for (const q of d.questions) initial[q.id] = null;
        for (const a of d.savedAnswers) {
          initial[a.questionId] = a.selectedIndex;
          timeSpentRef.current[a.questionId] = a.timeTakenSeconds;
        }
        // Compute the deadline using server time so a wrong device clock
        // cannot extend the test.
        const serverNow = new Date(d.serverNow).getTime();
        const startedAt = new Date(d.startedAt).getTime();
        const clockOffset = Date.now() - serverNow;
        deadlineRef.current =
          startedAt + d.test.durationMinutes * 60_000 + clockOffset;
        setAnswers(initial);
        setData(d);
        setRemaining(Math.max(0, (deadlineRef.current - Date.now()) / 1000));
        enteredAtRef.current = Date.now();
      } catch {
        if (!cancelled) setLoadError("Network error — refresh to try again");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, router]);

  const flushTime = useCallback((questionId: string) => {
    const elapsed = (Date.now() - enteredAtRef.current) / 1000;
    timeSpentRef.current[questionId] =
      (timeSpentRef.current[questionId] ?? 0) + elapsed;
    enteredAtRef.current = Date.now();
  }, []);

  const saveAnswer = useCallback(
    (questionId: string, selectedIndex: number | null) => {
      fetch(`/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          selectedIndex,
          timeTakenSeconds: Math.round(timeSpentRef.current[questionId] ?? 0),
        }),
      }).catch(() => {
        /* answers are re-sent on next save/submit; ignore transient failures */
      });
    },
    [attemptId]
  );

  const doSubmit = useCallback(async () => {
    if (submittingRef.current || !data) return;
    submittingRef.current = true;
    setSubmitting(true);
    const q = data.questions[current];
    if (q) {
      flushTime(q.id);
      // Final sync of the current question before submitting.
      try {
        await fetch(`/api/attempts/${attemptId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: q.id,
            selectedIndex: answers[q.id] ?? null,
            timeTakenSeconds: Math.round(timeSpentRef.current[q.id] ?? 0),
          }),
        });
      } catch {
        /* server grace period covers this */
      }
    }
    try {
      await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
    } catch {
      /* the server auto-submits expired attempts */
    }
    router.replace(`/result/${attemptId}`);
  }, [attemptId, answers, current, data, flushTime, router]);

  // Countdown tick + auto-submit at zero.
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        doSubmit();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [data, doSubmit]);

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-red-700">
          {loadError}
        </div>
      </div>
    );
  }
  if (!data || remaining === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        Loading test…
      </div>
    );
  }

  const questions = data.questions;
  const q = questions[current];
  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const lowTime = remaining <= 60;

  function selectOption(idx: number) {
    const next = answers[q.id] === idx ? null : idx;
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    flushTime(q.id);
    saveAnswer(q.id, next);
  }

  function goTo(idx: number) {
    if (idx === current || idx < 0 || idx >= questions.length) return;
    flushTime(q.id);
    saveAnswer(q.id, answers[q.id] ?? null);
    setCurrent(idx);
    setPaletteOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Sticky header with timer */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {data.test.title}
            </p>
            <p className="text-xs text-slate-500">
              {data.test.subjectLabel} · {data.candidateName}
            </p>
          </div>
          <div
            className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${
              lowTime ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800"
            }`}
            aria-label="Time remaining"
          >
            {formatClock(remaining)}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {/* Progress + palette toggle */}
        <div className="mb-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Question <strong>{current + 1}</strong> of {questions.length} ·{" "}
            {answeredCount} answered
          </span>
          <button
            onClick={() => setPaletteOpen((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {paletteOpen ? "Hide" : "All questions"}
          </button>
        </div>

        {paletteOpen && (
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
            {questions.map((question, i) => {
              const answered = answers[question.id] !== null;
              const isCurrent = i === current;
              return (
                <button
                  key={question.id}
                  onClick={() => goTo(i)}
                  aria-label={`Go to question ${i + 1}${answered ? " (answered)" : ""}`}
                  className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
                    isCurrent
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                      : answered
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        )}

        {/* Question card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-900 sm:text-lg">
            {q.text}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {q.options.map((opt, i) => {
              const selected = answers[q.id] === i;
              return (
                <button
                  key={i}
                  onClick={() => selectOption(i)}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-slate-800">{opt}</span>
                </button>
              );
            })}
          </div>
          {answers[q.id] !== null && (
            <button
              onClick={() => selectOption(answers[q.id] as number)}
              className="mt-4 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          {current < questions.length - 1 ? (
            <button
              onClick={() => goTo(current + 1)}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700"
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => setConfirmSubmit(true)}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700"
            >
              Submit test
            </button>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setConfirmSubmit(true)}
            className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Finish early &amp; submit
          </button>
        </div>
      </main>

      {/* Submit confirmation */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Submit test?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length &&
                ` ${questions.length - answeredCount} will be marked unattempted.`}{" "}
              You cannot change answers after submitting.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmSubmit(false)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Keep going
              </button>
              <button
                onClick={doSubmit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
