---
name: add-metric
description: Use when adding a metric, dimension or filter to the query catalog (backend/src/catalog) so the validator and SQL builder stay in sync and tested.
---

# Add a metric, dimension or filter

1. Add it to the table's entry in `backend/src/catalog/index.ts`. The catalog is the single source of truth: `validatePlan` and `buildSql` read from it, so there is no separate enum to extend. If the LLM should know about it, `describeCatalog()` picks it up automatically.
2. Add a validator test in `backend/src/query/*.test.ts`: one accepted plan and one rejected plan.
3. Add a builder test checking the generated SQL uses only whitelisted identifiers and bound parameters (`?`), and that it runs against the seeded database.
4. Never use string concatenation for values; values are always bound parameters. Never put plan-supplied strings into SQL text.
5. Run `npm test` before committing.
