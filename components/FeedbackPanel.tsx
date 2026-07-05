"use client";

import { useState } from "react";
import Markdown from "./Markdown";

export default function FeedbackPanel({
  attemptId,
  initialFeedback,
}: {
  attemptId: string;
  initialFeedback: string | null;
}) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/attempts/${attemptId}/feedback`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not generate feedback");
      } else {
        setFeedback(data.feedback);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">✨</span>
        <h2 className="text-lg font-semibold text-slate-900">AI coach feedback</h2>
      </div>
      {feedback ? (
        <div className="mt-3">
          <Markdown text={feedback} />
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-600">
            Get personalised feedback on your accuracy, time management and weak
            areas, with study tips for this section.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Analysing your performance…" : "Generate feedback"}
          </button>
        </div>
      )}
    </section>
  );
}
