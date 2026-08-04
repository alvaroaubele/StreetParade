# StreetParade

Street Parade Route App.

## How we work

Two principles govern this repo. They are not aspirational — they decide what
gets committed.

### 1. Do Hard Things (DHT)

Go at the root of the problem, not the easy work surrounding it. When a task can
be solved properly or solved cheaply, solve it properly.

- No scaffolding, stubs, or `TODO`s standing in for the actual hard part.
- Don't solve an adjacent easy problem and declare the hard one out of scope.
- If the real fix means restructuring something, restructure it.
- If something genuinely can't be done, say so plainly — don't ship a facade
  and describe it as finished.

### 2. Straight to main — no PRs, no merges

DHT means work is finished when it is committed. There is no review gate.

- Commit and push directly to `main`.
- Do not create feature branches.
- Do not open pull requests. Do not merge.
- `main` is the only long-lived branch.

**Corollary:** nothing downstream catches mistakes, so verification happens
before the push, not after. Run the tests, run the app, confirm the change
works — then commit.

## Permissions

`.claude/settings.json` sets `bypassPermissions`. Everything in this project is
pre-authorized; no tool call should ever prompt.
