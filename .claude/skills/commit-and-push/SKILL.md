---
name: commit-and-push
description: Use before every commit in this repo. Runs tests, checks staged changes for secrets, commits with a conventional message and pushes (never force).
---

# Commit and push

1. Run `npm test` and fix failures first.
2. Stage the files, then run `git diff --cached --stat`.
3. Run `git diff --cached | grep -iE "api[_-]?key|secret|sk-ant"`. It must return nothing (the repo is public). Confirm no `.env` file is staged.
4. Write a conventional commit message (feat, fix, test, docs, chore), then commit.
5. `git push`. Never force push.
