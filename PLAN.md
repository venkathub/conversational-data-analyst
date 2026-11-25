# Conversational Data Analyst: Project Plan

## Product
A full-stack app where a user asks business questions in natural language and gets an answer derived from structured banking data.

Example questions:
- Show monthly onboarding applications by customer segment.
- Which branches have the highest rejection rate?
- Compare retail and SME onboarding volumes.
- Show the top five customers by transaction value.

## Requirements
- Stack: React, Node.js, TypeScript on both frontend and backend, a relational database (SQLite), a charting library (Recharts), an LLM provider (Anthropic) with a mock fallback.
- Chat-style UI that accepts a natural-language question.
- Determine the relevant table, build a query, run it against the database.
- Present results as text, table, KPI card, bar chart or line chart.
- Copy buttons for the answer, the data (TSV) and the chart output (JSON).
- Graceful handling of invalid questions and technical errors.
- Sample banking data with at least two distinct datasets, created by a deterministic seed script.
- Engineering: strong typing, clear frontend/backend separation, modular code, input validation, safe database access, structured API responses, basic security.
- AI-generated SQL must never run unchecked.
- At least one meaningful automated test.
- README: architecture, assumptions, completed functionality, known limitations, how it would be productionised, setup instructions, and an AI disclosure (which AI development tools were used, and which architectural and implementation decisions were made personally; the design decisions table below is the source).
- `.env.example` and a schema or seed script.

## Design decisions
| # | Decision | Choice |
|---|---|---|
| 1 | Safety design | LLM returns a JSON query plan, never SQL. The server validates the plan against a whitelist catalog and builds parameterised SQL itself. |
| 2 | LLM setup | Anthropic when `ANTHROPIC_API_KEY` is set; rule-based mock fallback so tests and demos work offline. |
| 3 | Backend | Express + zod. |
| 4 | Validation policy | `validatePlan()` rejects strictly: unknown table/column/filter or out-of-range limit returns a clear "cannot answer" error. |

Defaults for the rest: SQLite (`better-sqlite3`, read-only connection), Vite + React + Recharts, Vitest, npm workspaces monorepo.

Assumptions: the Anthropic key lives in `backend/.env` (never committed; only `.env.example` is). Single user, no authentication (a known limitation).

## Architecture
```
repo/
  backend/   Express + TS + zod
    src/db/         schema.sql, seed.ts (deterministic), read-only connection
    src/catalog/    whitelist of tables, columns, metrics, dimensions
    src/llm/        LlmProvider interface, MockProvider, AnthropicProvider
    src/query/      planSchema (zod), validatePlan, buildSql (parameterised)
    src/routes/     POST /api/ask, GET /api/health
    src/errors/     typed AppError, error middleware
  frontend/  Vite + React + TS + Recharts
    chat UI, ResultView (text/table/KPI/bar/line), CopyButton
  shared/    API types (request, response, QueryPlan) used by both sides
  README.md, .env.example, PLAN.md, CLAUDE.md
```

**Request flow:** question -> zod-validate input (length cap) -> LLM provider returns a `QueryPlan` (or `unsupported`, which becomes a friendly "cannot answer" response) -> zod and catalog validation -> `buildSql` with bound params and `LIMIT` cap -> execute on read-only DB -> choose presentation (KPI / table / bar / line) -> structured response `{ok, answer, viz, columns, rows, meta}`.

## Data (4 tables, 3 logical datasets)
- `branches` (id, name, city, region, opened_on)
- `customers` (id, name, segment: Retail / SME / Corporate, branch_id, joined_on)
- `onboarding_applications` (id, customer_id, branch_id, segment, status: Approved / Rejected / Pending, submitted_at, decided_at)
- `transactions` (id, customer_id, branch_id, amount, type: Credit / Debit, channel: Branch / Online / Mobile, txn_date)

Datasets: (1) customers and branches, (2) onboarding applications, (3) transactions. Foreign keys and indexes on the join and date columns.

### Synthetic data generation (`backend/src/db/seed.ts`)
- Deterministic: a small seeded PRNG (for example mulberry32 with a fixed seed from `SEED`, default 42), so every run produces the same data and the tests can assert exact numbers. No network or LLM involved. Fake names are built from fixed first-name and surname lists.
- Volumes: about 12 branches across 4 regions, about 300 customers (about 60% Retail, 30% SME, 10% Corporate), about 1,500 onboarding applications and about 8,000 transactions. Dates span the last 24 months, up to a fixed reference date (not "today") so results are stable.
- Realistic shapes, so the example questions give interesting answers:
  - Each branch gets its own rejection rate (about 5% to 35%), so "highest rejection rate" has a clear ranking.
  - Monthly application volume has a gentle upward trend plus seasonality, and differs by segment, so the line chart has visible lines.
  - Retail volume is clearly larger than SME, so the Retail vs SME comparison is meaningful.
  - Transaction amounts follow a skewed (log-normal) distribution scaled by segment, so a few customers dominate the top 5.
  - Rejected applications have a `decided_at` after `submitted_at`; Pending ones have no `decided_at`. Only approved customers have transactions.
- Idempotent: `npm run seed -w backend` drops and recreates the tables inside a transaction, then inserts in batches. Output goes to `backend/data/bank.db` (git-ignored); the schema lives in `schema.sql` (committed).
- Seed tests: row counts, foreign-key integrity, no transactions before the customer joined, same seed gives the same totals.

## Example questions and presentation
- Monthly onboarding by segment -> line chart
- Highest rejection rate by branch -> bar chart (derived metric rejected/total)
- Retail vs SME onboarding volumes -> bar chart
- Top 5 customers by transaction value -> table / bar chart

## Security
- LLM output is untrusted: zod-parsed and checked against the catalog.
- DB handle is read-only; the builder emits only `SELECT`; values are bound params; identifiers come only from the whitelist.
- Row cap, question length cap, `helmet` and CORS basics; errors never leak stack traces or SQL.
- Frontend escapes all output (no `dangerouslySetInnerHTML`).

## Build order and commits
Each step is one commit, pushed right after.
1. Repo, `.gitignore`, `CLAUDE.md`, project skills, npm workspaces, tsconfig, `.env.example` (`ANTHROPIC_API_KEY=`, `ANTHROPIC_MODEL=`, `PORT=`, `DB_PATH=`, `SEED=`) -> `chore: scaffold monorepo and project files`
2. `schema.sql`, seeded data generator, `npm run seed` -> `feat(db): schema and deterministic seed data`
3. Seed tests (counts, FK integrity, determinism) -> `test(db): seed integrity`
4. Shared types and catalog whitelist (tables, columns, metrics, dimensions, derived `rejection_rate`) -> `feat(catalog): whitelist and shared types`
5. `QueryPlan` zod schema (includes an `unsupported` variant for out-of-scope questions), `validatePlan`, `buildSql` -> `feat(query): plan validation and safe SQL builder`
6. Guardrail tests: unknown table/column, injection strings, over-limit, no string-built values, only SELECT -> `test(query): guardrails`
7. `LlmProvider` interface and `MockProvider` (keyword rules for the four example questions plus synonyms; anything else returns `unsupported`) -> `feat(llm): provider interface and mock`
8. `AnthropicProvider` (JSON output via tool use, timeout, error mapping, selected when `ANTHROPIC_API_KEY` is set) -> `feat(llm): anthropic provider`
9. Express app: `POST /api/ask`, `GET /api/health`, input validation, `chooseViz`, structured responses, error middleware, helmet and CORS -> `feat(api): ask endpoint`
10. API tests: the four example questions end to end with the mock, invalid question, malformed body, provider failure -> `test(api): ask endpoint`
11. Frontend scaffold and chat UI (message list, input, loading state) -> `feat(ui): chat shell`
12. Result renderers: text, table, KPI card, bar chart, line chart -> `feat(ui): result renderers`
13. Copy buttons: answer text, data as TSV, chart output as JSON -> `feat(ui): copy actions`
14. Error and invalid-question UX (friendly messages, retry, suggested example questions) -> `feat(ui): error states`
15. README (architecture, assumptions, completed functionality, known limitations, productionisation, setup, repo URL, AI disclosure) -> `docs: readme`

If time is short, step 13 (copy actions) can be reduced to a plain "copy text" button, but steps 1-12, 14 and 15 are required to meet the requirements; step 8 is part of design decision 2.

## Git and GitHub
Checked with `gh` on 2026-11-25 (read-only; nothing created yet):
- `gh` is authenticated as `venkathub` over HTTPS with scopes `repo`, `workflow`, `read:org`, `gist`.
- `/data/aiTrack/assignment` is not a git repo yet and has no remote.
- No existing repo uses the name below.

Setup:
- Repo: `conversational-data-analyst`, public, default branch `main`.
- `git init -b main`, add `.gitignore` (node_modules, .env, *.db, dist), first commit, then `gh repo create conversational-data-analyst --public --source=. --remote=origin --push`.
- Commits: small, conventional prefixes (feat, fix, test, docs, chore). Push after every commit. Never force push.
- Secrets: the repo is public, so `.env` stays git-ignored and only `.env.example` (blank values) is committed. Run `git diff --cached` before every push and confirm nothing secret is staged.
- Repo URL: `https://github.com/venkathub/conversational-data-analyst` (also goes in the README).

## Claude Code project files (created in the first commit)

### `CLAUDE.md` (repo root)
```markdown
# Conversational Data Analyst

Full-stack TypeScript app: natural-language question -> JSON query plan -> validated, parameterised SQL on SQLite -> text / table / KPI / bar / line result.

## Layout
- backend/  Express + zod. src/{db,catalog,llm,query,routes,errors}
- frontend/ Vite + React + Recharts
- shared/   API and QueryPlan types used by both sides

## Hard rules
- The LLM never writes SQL. It returns a QueryPlan; the server validates it and builds SQL.
- Identifiers (tables, columns) come only from the catalog whitelist. Values are always bound parameters.
- validatePlan() rejects strictly. Never clamp or drop parts of a plan silently.
- DB connection is read-only. Every query has a LIMIT cap.
- Errors returned to the client are structured and never include stack traces or SQL.
- Never read, print or commit .env. Only .env.example (blank values) is committed.
- No `any`. Shared types come from shared/.

## Commands
- npm install
- npm run seed -w backend
- npm run dev        (backend and frontend)
- npm test

## Workflow
- Small commits using conventional prefixes (feat, fix, test, docs, chore); push after each commit.
- Run tests before committing. Check `git diff --cached` for secrets before every push (the repo is public).
```

### Project skills (`.claude/skills/<name>/SKILL.md`)
1. `add-metric` - use when adding a metric or dimension to the catalog.
   - Add it to `backend/src/catalog`, extend the zod enum in the plan schema, add a validator test (accepted and rejected case), add a builder test checking the SQL uses only whitelisted identifiers and bound parameters.
   - Never use string concatenation for values.
2. `commit-and-push` - use before every commit.
   - Run `npm test`, run `git diff --cached --stat` and `git diff --cached | grep -iE "api[_-]?key|secret|sk-ant"` (must return nothing), write a conventional commit message, commit, `git push` (never force push).
3. `readme-check` - use at the end.
   - Confirm the README has architecture, assumptions, completed functionality, known limitations, productionisation, setup instructions, the repo URL, and the AI disclosure (tools used, plus the decisions made personally).

Not planned: custom subagents, hooks, MCP servers.

## Done checklist
- [ ] GitHub repo created and pushed
- [ ] `CLAUDE.md` and project skills committed
- [ ] Source code, setup instructions, `.env.example`, seed script
- [ ] README sections complete, including the AI disclosure
- [ ] At least one meaningful automated test passing
- [ ] Clear commit history, everything pushed
