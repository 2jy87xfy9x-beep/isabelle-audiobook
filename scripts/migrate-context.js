// scripts/migrate-context.js — Node.js 18+, run from repo root
// Usage: node scripts/migrate-context.js [--dry-run]
//
// ONE-TIME migration: renames the `content` field on each context.json entry
// to `content_contextual`, and bumps schema_version from 2 to 3.
//
// Safe to re-run: skips entries that already have `content_contextual`.
// Run this BEFORE using export-context.js or import-context.js with --depth.

import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const ctx = JSON.parse(readFileSync('context.json', 'utf8'));

if (ctx.schema_version === 3) {
  console.log('Already at schema_version 3 — nothing to migrate.');
  process.exit(0);
}

let migrated = 0;
let skipped  = 0;

for (const entry of ctx.entries) {
  if (entry.content_contextual !== undefined) {
    // Already migrated
    skipped++;
    continue;
  }
  if (entry.content !== undefined) {
    entry.content_contextual = entry.content;
    delete entry.content;
    migrated++;
  } else {
    // No content field at all — initialise empty
    entry.content_contextual = [];
    migrated++;
  }
  // Ensure other depth arrays exist
  if (!entry.content_brief)       entry.content_brief       = [];
  if (!entry.content_encyclopedic) entry.content_encyclopedic = [];
}

ctx.schema_version = 3;

console.log(`Migrated: ${migrated}  |  Already done: ${skipped}`);
console.log(`schema_version → 3`);

if (dryRun) {
  console.log('--dry-run: context.json not written.');
  process.exit(0);
}

writeFileSync('context.json', JSON.stringify(ctx, null, 2), 'utf8');
console.log('✓ context.json updated');
