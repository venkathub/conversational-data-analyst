---
name: add-metric
description: Use when adding a metric or dimension to the query catalog (backend/src/catalog) so the validator and SQL builder stay in sync and tested.
---

# Add a metric or dimension

1. Add it to `backend/src/catalog` (whitelist of tables, columns, metrics, dimensions).
2. Extend the zod enum in the plan schema (`backend/src/query`).
3. Add a validator test: one accepted plan and one rejected plan.
4. Add a builder test checking the generated SQL uses only whitelisted identifiers and bound parameters.
5. Never use string concatenation for values; values are always bound parameters.
6. Run `npm test` before committing.
