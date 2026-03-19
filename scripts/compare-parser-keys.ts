/**
 * CI check: ensures every parser-accepted key is accounted for in key-descriptions.ts.
 *
 * Extracts accepted keys directly from parser.js by finding all parseObject()
 * call sites and pulling the key names from their object literal arguments.
 * No hardcoded key lists — when parser.js changes, this script automatically
 * picks up the new keys.
 *
 * Usage: npx tsx scripts/compare-parser-keys.ts
 * Exit 0 = all keys accounted for, Exit 1 = gaps found.
 */

import * as fs from "fs";
import * as path from "path";
import {
  keyDescriptions,
  isKeyAutocomplete,
  isKeyDocumented,
} from "../src/key-descriptions.js";

// --- Step 1: Extract key sets from parseObject() calls in parser.js ---

const parserSource = fs.readFileSync(
  path.join(__dirname, "..", "support", "parser.js"),
  "utf-8",
);

/**
 * Starting from an opening brace at `start`, find the matching close brace
 * using a depth counter. Returns the index of the closing brace.
 */
function findMatchingBrace(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    // Skip string literals to avoid counting braces inside strings
    else if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++; // skip escaped chars
        i++;
      }
    }
  }
  return -1;
}

/**
 * Extract the top-level keys from a JS object literal string.
 * Finds key patterns like `"key-name":` or `key:` at brace depth 0.
 */
function extractObjectKeys(objectLiteral: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;

  while (i < objectLiteral.length) {
    const ch = objectLiteral[i]!;

    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      i++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      i++;
      continue;
    }

    // Skip string literals
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++; // skip opening quote
      const keyStart = i;
      while (i < objectLiteral.length && objectLiteral[i] !== quote) {
        if (objectLiteral[i] === "\\") i++;
        i++;
      }
      const keyEnd = i;
      i++; // skip closing quote
      // At top level, check if this quoted string is an object key
      if (depth === 0) {
        let j = i;
        while (j < objectLiteral.length && /\s/.test(objectLiteral[j]!)) j++;
        if (objectLiteral[j] === ":") {
          keys.push(objectLiteral.substring(keyStart, keyEnd));
        }
      }
      continue;
    }

    // Unquoted identifier at top level: check if it's an object key
    if (depth === 0 && /[a-zA-Z_]/.test(ch)) {
      const keyStart = i;
      while (i < objectLiteral.length && /[\w-]/.test(objectLiteral[i]!)) i++;
      const keyEnd = i;
      let j = i;
      while (j < objectLiteral.length && /\s/.test(objectLiteral[j]!)) j++;
      if (objectLiteral[j] === ":") {
        keys.push(objectLiteral.substring(keyStart, keyEnd));
      }
      // Don't advance i — the char at i still needs processing
      continue;
    }

    i++;
  }

  return keys;
}

// Identify regions belonging to parseLeafSpec* methods (package definition
// parsing, not run definition parsing) so we can exclude their parseObject calls.
function findLeafSpecRegions(source: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const methodPattern = /parseLeafSpec\w*\s*=\s*async\s/g;
  let m;
  while ((m = methodPattern.exec(source)) !== null) {
    // Find the opening brace of the method body
    let braceIdx = source.indexOf("{", m.index);
    if (braceIdx === -1) continue;
    const end = findMatchingBrace(source, braceIdx);
    if (end !== -1) {
      regions.push([m.index, end]);
    }
  }
  return regions;
}

const leafSpecRegions = findLeafSpecRegions(parserSource);

function isInLeafSpec(offset: number): boolean {
  return leafSpecRegions.some(([start, end]) => offset >= start && offset <= end);
}

// Find all `this.parseObject(` calls and extract the second argument's keys
const parseObjectPattern = /this\.parseObject\s*\(/g;
const parserKeySets: string[][] = [];
let match;

while ((match = parseObjectPattern.exec(parserSource)) !== null) {
  // Skip parseObject calls inside parseLeafSpec* methods
  if (isInLeafSpec(match.index)) continue;
  const callStart = match.index + match[0].length;

  // Find the second argument — skip the first arg by balancing parens/braces
  // until we hit a comma at depth 0
  let depth = 0;
  let i = callStart;
  let foundComma = false;

  for (; i < parserSource.length; i++) {
    const ch = parserSource[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      foundComma = true;
      i++; // skip the comma
      break;
    }
    // Skip strings
    else if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < parserSource.length && parserSource[i] !== quote) {
        if (parserSource[i] === "\\") i++;
        i++;
      }
    }
  }

  if (!foundComma) continue;

  // Skip whitespace to find the opening brace of the second argument
  while (i < parserSource.length && /\s/.test(parserSource[i]!)) i++;

  // If second arg is not an object literal, skip (recursive calls pass `parsers` variable)
  if (parserSource[i] !== "{") continue;

  const braceStart = i;
  const braceEnd = findMatchingBrace(parserSource, braceStart);
  if (braceEnd === -1) continue;

  const objectBody = parserSource.substring(braceStart + 1, braceEnd);
  const keys = extractObjectKeys(objectBody);

  if (keys.length > 0) {
    parserKeySets.push(keys);
  }
}

// --- Step 2: Build key-descriptions child sets for comparison ---

// Normalize a key-descriptions path by stripping [] and * segments
function normalizePath(p: string): string {
  return p
    .replace(/\[\]/g, "")
    .split(".")
    .filter((s) => s !== "*")
    .join(".");
}

// Build: normalized parent → set of children from key-descriptions
const descriptionGroups = new Map<string, Set<string>>();
const wildcardParents = new Set<string>();

for (const fullPath of Object.keys(keyDescriptions)) {
  const lastDot = fullPath.lastIndexOf(".");
  const rawParent = lastDot === -1 ? "" : fullPath.substring(0, lastDot);
  let child = lastDot === -1 ? fullPath : fullPath.substring(lastDot + 1);

  // Track wildcard parents (from parseGenericRecord, not parseObject)
  if (child === "*") {
    wildcardParents.add(normalizePath(rawParent));
    continue;
  }
  if (child.endsWith("[]")) {
    child = child.slice(0, -2);
  }

  const normalizedParent = normalizePath(rawParent);
  if (!descriptionGroups.has(normalizedParent)) {
    descriptionGroups.set(normalizedParent, new Set());
  }
  descriptionGroups.get(normalizedParent)!.add(child);
}

// --- Step 3: Match parser key sets against key-descriptions groups ---
//
// Strategy: each parseObject call produces a set of child keys. Each
// key-descriptions parent path also has a set of child keys. We match them
// by finding, for each parser key set, which description group(s) it's a
// subset of (or equal to). Then we check both directions.

// Flatten all parser keys into a set of individual keys, tagged by which
// key set they came from, for reporting.
// But the more useful check: for each parser key set, find its matching
// description group, then verify all keys exist.

let failures = 0;

// Check 1: Every key in every parser key set should exist in SOME description group
console.log("=== Keys accepted by parser but NOT in key-descriptions.ts ===\n");

let foundParserOnly = false;

for (const parserKeys of parserKeySets) {
  // Find the best matching description group (most key overlap)
  let bestMatch: { parent: string; children: Set<string> } | null = null;
  let bestOverlap = 0;

  for (const [parent, children] of descriptionGroups) {
    const overlap = parserKeys.filter((k) => children.has(k)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = { parent, children };
    }
  }

  for (const key of parserKeys) {
    // Check in best-matching group
    if (bestMatch?.children.has(key)) continue;

    // Check if the key leads to child entries in any group
    const fullPath = bestMatch ? `${bestMatch.parent}.${key}` : key;
    const hasChildren = [...descriptionGroups.keys()].some(
      (p) => p === fullPath || p.startsWith(fullPath + "."),
    );
    if (hasChildren) continue;

    // Check if documented under a wildcard parent
    if (bestMatch && wildcardParents.has(bestMatch.parent)) continue;

    // Check ALL groups as fallback (key might appear in multiple contexts)
    let foundAnywhere = false;
    for (const [parent, children] of descriptionGroups) {
      if (children.has(key)) {
        foundAnywhere = true;
        break;
      }
      const fp = parent ? `${parent}.${key}` : key;
      const hc = [...descriptionGroups.keys()].some(
        (p) => p === fp || p.startsWith(fp + "."),
      );
      if (hc) {
        foundAnywhere = true;
        break;
      }
    }
    if (foundAnywhere) continue;

    console.log(
      `  MISSING: "${key}" in parser key set [${parserKeys.join(", ")}]` +
        (bestMatch ? ` (best match: ${bestMatch.parent || "(root)"})` : ""),
    );
    foundParserOnly = true;
    failures++;
  }
}

if (!foundParserOnly) {
  console.log("  (none)\n");
}

// Check 2: Every key-descriptions entry should appear in SOME parser key set
console.log(
  "\n=== Keys in key-descriptions.ts but NOT accepted by parser ===\n",
);

let foundDescOnly = false;

// Build a flat set of all parser-accepted keys for quick lookup
const allParserKeys = new Set<string>();
for (const keys of parserKeySets) {
  for (const k of keys) {
    allParserKeys.add(k);
  }
}

for (const [normalizedParent, children] of descriptionGroups) {
  for (const child of children) {
    const fullPath = normalizedParent
      ? `${normalizedParent}.${child}`
      : child;

    // Find the original key-descriptions path
    const originalPath = Object.keys(keyDescriptions).find(
      (k) => normalizePath(k) === fullPath,
    );

    // Skip acknowledged internal keys
    if (
      originalPath &&
      !isKeyAutocomplete(originalPath) &&
      !isKeyDocumented(originalPath)
    ) {
      continue;
    }

    // Skip children under wildcard parents (parseGenericRecord)
    if (wildcardParents.has(normalizedParent)) continue;
    const parentSegments = normalizedParent.split(".");
    let isUnderWildcard = false;
    for (let i = parentSegments.length; i >= 1; i--) {
      if (wildcardParents.has(parentSegments.slice(0, i).join("."))) {
        isUnderWildcard = true;
        break;
      }
    }
    if (isUnderWildcard) continue;

    // Check if the key appears in any parser key set
    if (allParserKeys.has(child)) continue;

    console.log(
      `  STALE: ${fullPath}${originalPath ? ` (from ${originalPath})` : ""}`,
    );
    foundDescOnly = true;
    failures++;
  }
}

if (!foundDescOnly) {
  console.log("  (none)\n");
}

// Exit with appropriate code
if (failures > 0) {
  console.log(
    `\n✗ ${failures} issue(s) found. Update key-descriptions.ts to fix.`,
  );
  process.exit(1);
} else {
  console.log(
    "\n✓ All parser keys are accounted for in key-descriptions.ts.",
  );
  process.exit(0);
}
