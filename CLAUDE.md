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
