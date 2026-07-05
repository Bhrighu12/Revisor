"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
}

interface TestData {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  marksCorrect: number;
  marksWrong: number;
  isActive: boolean;
  questions: Question[];
  _count: { attempts: number };
}

interface Draft {
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  GENERAL_AWARENESS: "General Awareness",
  ENGLISH: "English",
  MATHEMATICS: "Mathematics",
  REASONING: "Reasoning",
};

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Parses an uploaded JSON file into draft questions. Accepts either a bare
 * array or { "questions": [...] }. Each item needs `text` (or `question`),
 * an `options` string array, and the correct answer as `correctIndex`
 * (0-based number) or `correctOption` / `answer` (a letter like "B").
 */
function parseJsonQuestions(raw: string): { drafts: Draft[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { drafts: [], error: "This file is not valid JSON" };
  }

  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : null;
  if (!list) {
    return {
      drafts: [],
      error: 'Expected a JSON array of questions, or an object like { "questions": [...] }',
    };
  }
  if (list.length === 0) {
    return { drafts: [], error: "The file contains no questions" };
  }

  const drafts: Draft[] = [];
  const problems: string[] = [];

  list.forEach((item, i) => {
    const label = `Question ${i + 1}`;
    if (!item || typeof item !== "object") {
      problems.push(`${label}: not an object`);
      return;
    }
    const q = item as Record<string, unknown>;

    const text =
      typeof q.text === "string" && q.text.trim()
        ? q.text.trim()
        : typeof q.question === "string"
          ? q.question.trim()
          : "";
    if (!text) {
      problems.push(`${label}: missing "text"`);
      return;
    }

    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string").map((o) => o.trim())
      : [];
    if (options.length < 2 || options.some((o) => !o)) {
      problems.push(`${label}: needs an "options" array with 2+ non-empty strings`);
      return;
    }

    let correctIndex = -1;
    const letter = q.correctOption ?? q.answer;
    if (typeof q.correctIndex === "number" && Number.isInteger(q.correctIndex)) {
      correctIndex = q.correctIndex;
    } else if (typeof letter === "string") {
      correctIndex = OPTION_LETTERS.indexOf(letter.trim().toUpperCase());
    } else if (typeof letter === "number" && Number.isInteger(letter)) {
      correctIndex = letter;
    }
    if (correctIndex < 0 || correctIndex >= options.length) {
      problems.push(
        `${label}: needs "correctIndex" (0-based) or "correctOption" (a letter like "B") matching an option`
      );
      return;
    }

    const explanation =
      typeof q.explanation === "string" && q.explanation.trim() ? q.explanation.trim() : undefined;

    drafts.push({ text, options, correctIndex, explanation });
  });

  if (problems.length > 0) {
    return { drafts: [], error: problems.slice(0, 5).join(" · ") };
  }
  return { drafts };
}

const emptyForm = {
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  explanation: "",
};

export default function TestEditor({ testId }: { testId: string }) {
  const router = useRouter();
  const [test, setTest] = useState<TestData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [marksCorrect, setMarksCorrect] = useState(3);
  const [marksWrong, setMarksWrong] = useState(1);
  const [savingSettings, setSavingSettings] = useState(false);

  // Manual add / edit
  const [form, setForm] = useState(emptyForm);
  const [addOpen, setAddOpen] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // AI generation
  const [aiOpen, setAiOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCount, setImportCount] = useState(20);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  // JSON import
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonError, setJsonError] = useState("");

  // Shuffle
  const [shuffling, setShuffling] = useState(false);

  // Draft review (shared by AI + import)
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingDrafts, setSavingDrafts] = useState(false);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/tests/${testId}`);
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error || "Could not load the test");
      return;
    }
    setTest(data.test);
    setTitle(data.test.title);
    setDuration(data.test.durationMinutes);
    setMarksCorrect(data.test.marksCorrect);
    setMarksWrong(data.test.marksWrong);
  }, [testId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{loadError}</p>;
  }
  if (!test) {
    return <p className="text-slate-500">Loading…</p>;
  }

  async function saveSettings(extra?: { isActive?: boolean }) {
    setSavingSettings(true);
    const res = await fetch(`/api/admin/tests/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, durationMinutes: duration, marksCorrect, marksWrong, ...extra }),
    });
    setSavingSettings(false);
    if (res.ok) {
      showNotice("Settings saved");
      load();
    } else {
      const data = await res.json();
      showNotice(data.error || "Could not save settings");
    }
  }

  async function deleteTest() {
    if (!confirm("Delete this test, its questions and all attempts? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/tests/${testId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin/dashboard");
      router.refresh();
    }
  }

  function validateForm(): string | null {
    if (!form.text.trim()) return "Question text is required";
    if (form.options.some((o) => !o.trim())) return "All four options are required";
    return null;
  }

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateForm();
    if (problem) {
      showNotice(problem);
      return;
    }
    setSavingQuestion(true);
    const payload = {
      text: form.text,
      options: form.options,
      correctIndex: form.correctIndex,
      explanation: form.explanation,
    };
    const res = editingId
      ? await fetch(`/api/admin/questions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/admin/tests/${testId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSavingQuestion(false);
    if (res.ok) {
      setForm(emptyForm);
      setEditingId(null);
      setAddOpen(false);
      showNotice(editingId ? "Question updated" : "Question added");
      load();
    } else {
      const data = await res.json();
      showNotice(data.error || "Could not save the question");
    }
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setForm({
      text: q.text,
      options: [...q.options, "", "", "", ""].slice(0, Math.max(4, q.options.length)),
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? "",
    });
    setAddOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      showNotice("Question deleted");
      load();
    }
  }

  async function generateWithAI(e: React.FormEvent) {
    e.preventDefault();
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch(`/api/admin/tests/${testId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, count: aiCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Generation failed");
      } else {
        setDrafts(data.drafts);
        setAiOpen(false);
      }
    } catch {
      setAiError("Network error — please try again");
    } finally {
      setAiBusy(false);
    }
  }

  async function importDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setImportError("Choose a PDF, DOCX or TXT file first");
      return;
    }
    setImportBusy(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("count", String(importCount));
      const res = await fetch(`/api/admin/tests/${testId}/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Import failed");
      } else {
        setDrafts(data.drafts);
        setImportOpen(false);
        setImportFile(null);
      }
    } catch {
      setImportError("Network error — please try again");
    } finally {
      setImportBusy(false);
    }
  }

  async function shuffleQuestions() {
    setShuffling(true);
    const res = await fetch(`/api/admin/tests/${testId}/questions/shuffle`, {
      method: "POST",
    });
    setShuffling(false);
    if (res.ok) {
      showNotice("Question order shuffled");
      load();
    } else {
      const data = await res.json().catch(() => null);
      showNotice(data?.error || "Could not shuffle the questions");
    }
  }

  async function importJson(e: React.FormEvent) {
    e.preventDefault();
    if (!jsonFile) {
      setJsonError("Choose a .json file first");
      return;
    }
    setJsonError("");
    const raw = await jsonFile.text();
    const { drafts: parsed, error } = parseJsonQuestions(raw);
    if (error) {
      setJsonError(error);
      return;
    }
    setDrafts(parsed);
    setJsonOpen(false);
    setJsonFile(null);
  }

  async function saveDrafts() {
    setSavingDrafts(true);
    const res = await fetch(`/api/admin/tests/${testId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: drafts }),
    });
    setSavingDrafts(false);
    if (res.ok) {
      const data = await res.json();
      setDrafts([]);
      showNotice(`Added ${data.count} questions`);
      load();
    } else {
      const data = await res.json();
      showNotice(data.error || "Could not save the questions");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <main>
      {notice && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
        </div>
      )}

      <div className="mb-6">
        <p className="text-sm text-slate-500">{SUBJECT_LABELS[test.subject]}</p>
        <h1 className="text-2xl font-bold text-slate-900">{test.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {test.questions.length} questions · {test.durationMinutes} min timer · +
          {test.marksCorrect}/−{test.marksWrong} marking · {test._count.attempts} attempts
        </p>
      </div>

      {/* Settings */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">Test settings</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Timer (minutes)</label>
            <input
              type="number"
              min={1}
              max={300}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Marks per correct
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={marksCorrect}
              onChange={(e) => setMarksCorrect(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Negative marks per wrong
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={marksWrong}
              onChange={(e) => setMarksWrong(Number(e.target.value))}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-500">0 disables negative marking</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => saveSettings()}
            disabled={savingSettings}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingSettings ? "Saving…" : "Save settings"}
          </button>
          <button
            onClick={() => saveSettings({ isActive: !test.isActive })}
            className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            {test.isActive ? "Disable test" : "Enable test"}
          </button>
          <button
            onClick={deleteTest}
            className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete test
          </button>
        </div>
      </section>

      {/* Add question actions */}
      <div className="mb-4 flex flex-wrap gap-3">
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setAddOpen((v) => !v);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Add manually
        </button>
        <button
          onClick={() => setAiOpen((v) => !v)}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          ✨ Generate with AI
        </button>
        <button
          onClick={() => setImportOpen((v) => !v)}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          📄 Import PDF / Word
        </button>
        <button
          onClick={() => setJsonOpen((v) => !v)}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          {"{ }"} Import JSON
        </button>
      </div>

      {/* Manual add / edit form */}
      {addOpen && (
        <form onSubmit={submitQuestion} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">
            {editingId ? "Edit question" : "Add a question"}
          </h3>
          <label className="mb-1 block text-sm font-medium text-slate-700">Question</label>
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={3}
            className={inputCls}
            required
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={form.correctIndex === i}
                  onChange={() => setForm({ ...form, correctIndex: i })}
                  title="Mark as correct answer"
                  className="h-4 w-4 accent-emerald-600"
                />
                <input
                  value={opt}
                  onChange={(e) => {
                    const options = [...form.options];
                    options[i] = e.target.value;
                    setForm({ ...form, options });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className={inputCls}
                  required
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Select the radio button next to the correct option.
          </p>
          <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">
            Explanation (optional)
          </label>
          <textarea
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            rows={2}
            className={inputCls}
          />
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={savingQuestion}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingQuestion ? "Saving…" : editingId ? "Update question" : "Add question"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* AI generate form */}
      {aiOpen && (
        <form onSubmit={generateWithAI} className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
          <h3 className="mb-1 font-semibold text-slate-900">Generate questions with AI</h3>
          <p className="mb-4 text-sm text-slate-600">
            AFCAT-style {SUBJECT_LABELS[test.subject]} questions. You review them before they are added.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Topic (optional)
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Indian defence history, percentages, synonyms…"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Number of questions
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
          {aiError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {aiError}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={aiBusy}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {aiBusy ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Import form */}
      {importOpen && (
        <form onSubmit={importDocument} className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
          <h3 className="mb-1 font-semibold text-slate-900">Import from a document</h3>
          <p className="mb-4 text-sm text-slate-600">
            Upload a PDF, Word (.docx) or text file. The AI extracts existing questions, or
            creates questions from study material. You review them before they are added.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">File</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Max questions
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={importCount}
                onChange={(e) => setImportCount(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
          {importError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {importError}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={importBusy}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {importBusy ? "Extracting…" : "Extract questions"}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* JSON import form */}
      {jsonOpen && (
        <form onSubmit={importJson} className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
          <h3 className="mb-1 font-semibold text-slate-900">Import from a JSON file</h3>
          <p className="mb-3 text-sm text-slate-600">
            Upload a .json file with your questions. No AI involved — questions are added exactly
            as written, after your review.
          </p>
          <details className="mb-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-indigo-700">
              Expected format
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`[
  {
    "text": "What is the capital of India?",
    "options": ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
    "correctIndex": 1,
    "explanation": "New Delhi has been the capital since 1911."
  }
]`}
            </pre>
            <p className="mt-2">
              Also accepted: <code className="rounded bg-slate-200 px-1">{`{ "questions": [...] }`}</code> as
              the top level, <code className="rounded bg-slate-200 px-1">question</code> instead of{" "}
              <code className="rounded bg-slate-200 px-1">text</code>, and{" "}
              <code className="rounded bg-slate-200 px-1">correctOption</code> /{" "}
              <code className="rounded bg-slate-200 px-1">answer</code> as a letter (&quot;A&quot;–&quot;D&quot;)
              instead of <code className="rounded bg-slate-200 px-1">correctIndex</code>.{" "}
              <code className="rounded bg-slate-200 px-1">explanation</code> is optional.
            </p>
          </details>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">File</label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 sm:max-w-md"
            />
          </div>
          {jsonError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {jsonError}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700"
            >
              Load questions
            </button>
            <button
              type="button"
              onClick={() => {
                setJsonOpen(false);
                setJsonError("");
              }}
              className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Draft review */}
      {drafts.length > 0 && (
        <section className="mb-6 rounded-2xl border-2 border-indigo-300 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">
                Review {drafts.length} draft question{drafts.length > 1 ? "s" : ""}
              </h3>
              <p className="text-sm text-slate-500">
                Remove any you don&apos;t want, then add the rest to the test.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveDrafts}
                disabled={savingDrafts}
                className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingDrafts ? "Adding…" : `Add ${drafts.length} to test`}
              </button>
              <button
                onClick={() => setDrafts([])}
                className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Discard all
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {i + 1}. {d.text}
                  </p>
                  <button
                    onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                    className="shrink-0 text-sm font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.options.map((opt, j) => (
                    <li
                      key={j}
                      className={
                        j === d.correctIndex
                          ? "font-semibold text-emerald-700"
                          : "text-slate-600"
                      }
                    >
                      {String.fromCharCode(65 + j)}. {opt}
                      {j === d.correctIndex && " ✓"}
                    </li>
                  ))}
                </ul>
                {d.explanation && (
                  <p className="mt-2 text-xs text-slate-500">{d.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Question list */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Questions ({test.questions.length})
        </h2>
        {test.questions.length > 1 && (
          <button
            onClick={shuffleQuestions}
            disabled={shuffling}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {shuffling ? "Shuffling…" : "🔀 Shuffle order"}
          </button>
        )}
      </div>
      {test.questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No questions yet — add them manually, generate with AI, or import a document or JSON file.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {test.questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap font-medium text-slate-900">
                  {i + 1}. {q.text}
                </p>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button onClick={() => startEdit(q)} className="font-medium text-indigo-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => deleteQuestion(q.id)} className="font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {q.options.map((opt, j) => (
                  <li
                    key={j}
                    className={
                      j === q.correctIndex ? "font-semibold text-emerald-700" : "text-slate-600"
                    }
                  >
                    {String.fromCharCode(65 + j)}. {opt}
                    {j === q.correctIndex && " ✓"}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="mt-2 text-xs text-slate-500">{q.explanation}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
