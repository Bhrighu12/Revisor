const DEFAULT_MODEL = "gemini-2.5-flash";

export interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

async function callGemini(prompt: string, jsonMode: boolean): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment to use AI features."
    );
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("");
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return text;
}

function extractJson(raw: string): string {
  // Strip markdown code fences if the model wrapped its output in them.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function validateDrafts(parsed: unknown): DraftQuestion[] {
  if (!Array.isArray(parsed)) {
    throw new Error("AI did not return a list of questions");
  }
  const drafts: DraftQuestion[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const q = item as Record<string, unknown>;
    const text = typeof q.text === "string" ? q.text.trim() : "";
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string").map((o) => o.trim())
      : [];
    const correctIndex =
      typeof q.correctIndex === "number" ? Math.trunc(q.correctIndex) : -1;
    if (!text || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) {
      continue;
    }
    drafts.push({
      text,
      options,
      correctIndex,
      explanation:
        typeof q.explanation === "string" && q.explanation.trim()
          ? q.explanation.trim()
          : undefined,
    });
  }
  if (drafts.length === 0) {
    throw new Error("AI output contained no valid questions — try again");
  }
  return drafts;
}

export async function generateQuestionsFromTopic(
  subject: string,
  topic: string,
  count: number
): Promise<DraftQuestion[]> {
  const prompt = `You are an expert question setter for the AFCAT (Air Force Common Admission Test) exam in India.

Generate exactly ${count} multiple-choice questions for the "${subject}" section${topic ? ` on the topic: "${topic}"` : ""}.

Rules:
- AFCAT exam difficulty and style.
- Each question has exactly 4 options and exactly one correct answer.
- Include a brief explanation for the correct answer.
- Vary difficulty across the set.

Respond with ONLY a JSON array in this exact shape:
[{"text": "question text", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "why"}]`;

  const raw = await callGemini(prompt, true);
  return validateDrafts(JSON.parse(extractJson(raw)));
}

export async function extractQuestionsFromDocument(
  subject: string,
  documentText: string,
  maxCount: number
): Promise<DraftQuestion[]> {
  // Keep the prompt within a safe size for the API.
  const clipped = documentText.slice(0, 100_000);
  const prompt = `You are helping build a question bank for the AFCAT exam ("${subject}" section).

Below is text extracted from a document. Extract every multiple-choice question you can find (up to ${maxCount}). If the document contains study material rather than ready-made questions, create good AFCAT-style multiple-choice questions FROM that material instead.

Rules:
- Each question must have exactly 4 options and exactly one correct answer.
- If the document states the correct answer, use it; otherwise determine it yourself.
- Add a brief explanation for each correct answer.
- Clean up OCR/extraction artifacts in the wording.

DOCUMENT TEXT:
"""
${clipped}
"""

Respond with ONLY a JSON array in this exact shape:
[{"text": "question text", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "why"}]`;

  const raw = await callGemini(prompt, true);
  return validateDrafts(JSON.parse(extractJson(raw)));
}

export interface FeedbackInput {
  candidateName: string;
  testTitle: string;
  subject: string;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  scorePercent: number;
  totalTimeSeconds: number;
  durationMinutes: number;
  avgTimePerQuestionSeconds: number;
  slowestQuestions: { text: string; timeSeconds: number; wasCorrect: boolean }[];
  incorrectQuestions: { text: string; chosen: string; correctAnswer: string }[];
}

export async function generateFeedback(input: FeedbackInput): Promise<string> {
  const prompt = `You are a friendly, insightful AFCAT exam coach. A candidate just finished a practice test. Write personalised performance feedback for them.

PERFORMANCE DATA:
${JSON.stringify(input, null, 2)}

Write feedback addressed directly to ${input.candidateName} covering:
1. Overall performance summary (score, accuracy).
2. Time management — how they used their time, whether they were too slow or rushed, referencing the slowest questions if notable.
3. Weak areas — patterns in the incorrect questions and what concepts to revise.
4. 3-4 concrete, actionable study tips for the "${input.subject}" section of AFCAT.
5. An encouraging closing line.

Rules:
- Use markdown with short section headings and bullet points.
- Be specific to the data, not generic.
- Keep it under 350 words.`;

  return callGemini(prompt, false);
}
