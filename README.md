# Revisor — AFCAT Quiz & Revision App

A mobile-friendly web app for AFCAT practice tests across the four exam sections —
**General Awareness, English, Mathematics and Reasoning** — with a super-admin panel,
AI question generation, PDF/Word import, timed tests via unique access codes, detailed
result reports, and AI-generated performance feedback.

## Features

**For candidates**
- Enter an access code + your name, and start the test — no account needed.
- Timed test (timer length is set by the admin per test) with auto-submit when time runs out.
- Question palette, answer changes, clear-selection, per-question time tracking.
- Full result report: score, correct / incorrect / unattempted, time taken per question,
  correct answers with explanations, and AI coach feedback on your performance.

**For the super admin** (`/admin`)
- Password-protected admin panel.
- Create tests for any of the 4 AFCAT sections with a customizable timer.
- Add questions three ways:
  1. **Manually** — type the question, 4 options, correct answer, optional explanation.
  2. **AI generation** — give a topic and count; Gemini writes AFCAT-style questions for review.
  3. **Document import** — upload a PDF / Word (.docx) / text file; the AI extracts or creates
     questions from it for review.
- Generate unique access codes per test (single-use or multi-use), enable/disable/delete them.
- View all attempts and open any candidate's full report.

## Tech stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **PostgreSQL** via **Prisma 7** (Neon in production)
- **Google Gemini API** for question generation, document extraction, and feedback
- Deploys to **Vercel**

## Local development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set environment variables** — copy `.env.example` to `.env` and fill in:

   | Variable | What it is |
   |---|---|
   | `DATABASE_URL` | Postgres connection string |
   | `ADMIN_PASSWORD` | Password for `/admin` |
   | `AUTH_SECRET` | Long random string (signs the admin session cookie) |
   | `GEMINI_API_KEY` | Free key from [Google AI Studio](https://aistudio.google.com/apikey) |

3. **Start a local database** — easiest option, no install needed:

   ```bash
   npx prisma dev
   ```

   Copy the connection string it prints into `DATABASE_URL` in `.env`.
   (Or use any Postgres instance, including your Neon database.)

4. **Create the tables**

   ```bash
   npx prisma db push
   ```

5. **Run the app**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 — candidate side.
   Open http://localhost:3000/admin — admin panel.

## Deploying to Vercel (free)

1. **Create the database** — sign up at [neon.tech](https://neon.tech), create a project,
   and copy the **pooled connection string** (starts with `postgresql://`).

2. **Get a Gemini key** — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

3. **Push this repo to GitHub**, then import it at [vercel.com/new](https://vercel.com/new).

4. **Set environment variables** in the Vercel project settings (all four from the table
   above). For `AUTH_SECRET` generate a random string:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **Deploy.** The `vercel-build` script automatically creates/updates the database tables
   (`prisma db push`) on every deploy.

6. Visit `https://your-app.vercel.app/admin`, sign in with `ADMIN_PASSWORD`, create a test,
   add questions, generate access codes, and share them with candidates.

## How access codes work

- Each code is tied to one test and has a **use limit** (default 1 — one candidate).
- Generate a batch of single-use codes to give one per student, or one multi-use code
  for a whole group.
- Codes can be disabled or deleted at any time.

## Notes

- The test timer is enforced **server-side** (a slow device or clock change can't extend it);
  a short grace period absorbs network latency on auto-submit.
- Candidates' answers are saved as they go — a page refresh resumes the test with time
  still counting down.
- AI feedback is generated once per attempt and cached.
