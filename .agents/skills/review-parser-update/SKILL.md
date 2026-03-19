---
name: review-parser-update
description: Review a parser.js update PR to check if parser.d.ts, key-descriptions.ts, or arrayKeys need changes
argument-hint: "[PR number or URL]"
---

# Review Parser Update

When `support/parser.js` is updated from the mint repo, several other files may need corresponding changes. This skill walks through each check.

## Prerequisites

- The PR with the parser update must be available (either as a local branch or a GitHub PR)
- You need access to both the old and new versions of `support/parser.js`

## Required Workflow

### Step 0: Check out the PR branch locally

Before doing any analysis, check out the PR branch so that all local tooling runs against the **new** `parser.js`. Use `gh pr checkout <number>` if you're not already on the branch. All subsequent steps assume you are on the PR branch.

### Step 1: Understand the parser changes

Get the diff of `support/parser.js` from the PR. Focus on structural changes, not cosmetic ones (variable renaming, number suffix changes, etc.). Identify:

- New YAML keys being parsed
- Removed YAML keys
- Changed parse methods (e.g., `parseStringableNoExpression` → `parseStringableTemplate`)
- New or changed types/enums

### Step 2: Check `support/parser.d.ts`

This file provides TypeScript type definitions for the compiled `parser.js`. Compare the types exported by the new parser against the current `.d.ts` file.

Things to check:
- New enums or enum values in the parser that aren't in `parser.d.ts`
- New or changed type shapes (e.g., new fields on `PartialBaseLayer`, `PartialRunDefinition`, `CommandTaskDefinition`, etc.)
- New exported functions or constants
- Removed exports that should be cleaned up

To verify: after any changes, run `npx tsc --noEmit` to confirm type compatibility.

### Step 3: Check `src/key-descriptions.ts`

This file maps dotted YAML key paths to human-readable descriptions shown on hover. If the parser now accepts new YAML keys, they should have descriptions added here.

**Start by running `npm run check-key-descriptions`.** This script automatically parses `parser.js` to extract all accepted keys and compares them against `key-descriptions.ts`. It will report:
- `MISSING`: keys the parser accepts but that have no entry in `key-descriptions.ts`
- `STALE`: keys in `key-descriptions.ts` that the parser no longer accepts

For any `MISSING` keys, add entries using the dotted path format (e.g., `"tasks[].new-key"`, `"base.new-key"`, `"on.github.push.new-key"`). The script output includes the parser key set and best-matching parent path to help you determine the correct dotted path.

Each entry is either a plain string description or a `KeyDescriptionEntry` object with `description`, `documented`, and `autocomplete` fields.

### Step 4: Check the `arrayKeys` set in `src/server.ts`

The `arrayKeys` set (search for `const arrayKeys = new Set`) identifies which YAML keys represent arrays. This is used when building dotted key paths for completions and hover — array parents get `[]` appended to their path segment.

Things to check:
- If the parser now accepts new keys whose values are arrays/sequences, add them to `arrayKeys`
- If any existing array keys were removed, remove them from `arrayKeys`

### Step 5: Verify

Run the following to confirm everything is consistent:

```bash
npx tsc --noEmit
npm test
```

## Output

Summarize your findings for each step:
- What changed in the parser
- Whether `parser.d.ts` needs updates (and what)
- Whether `key-descriptions.ts` needs updates (and what)
- Whether `arrayKeys` needs updates (and what)

If no changes are needed for a step, say so explicitly.
