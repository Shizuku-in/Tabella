#!/usr/bin/env node
// Validate the three-layer error-code contract; drift fails the build (runs before tsc in web build).
//   apps/api/src/api/error_codes.rs        Rust constants, source of server-side codes
//   apps/web/src/lib/api-error-codes.ts     TS mirror, may also define frontend-only codes
//   apps/web/src/lib/api.ts ERROR_MESSAGE_MAP   code -> i18n key
//   apps/web/src/locales/*.json             api.errors.* translations (all locales auto-discovered)
// TS's `satisfies Record<ApiErrorCode,string>` already guarantees "every TS code has a map entry";
// this covers what it can't: Rust->TS subset, mapped key -> locale existence, cross-locale parity.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (rel) => readFileSync(join(ROOT, ...rel.split('/')), 'utf8')

// Codes produced only by the frontend, never emitted by the server.
const FRONTEND_ONLY = new Set(['network_error', 'upload_aborted'])

// Layer 1: Rust constants
const rustSrc = read('apps/api/src/api/error_codes.rs')
const rustCodes = new Set(
  [...rustSrc.matchAll(/pub const \w+: &str = "([a-z0-9_]+)";/g)].map((m) => m[1]),
)

// Layer 2a: TS mirror (constant name -> code value)
const tsSrc = read('apps/web/src/lib/api-error-codes.ts')
const tsNameToValue = new Map(
  [...tsSrc.matchAll(/^\s*([A-Z0-9_]+):\s*'([a-z0-9_]+)',/gm)].map((m) => [m[1], m[2]]),
)
const tsCodes = new Set(tsNameToValue.values())

// Layer 2b: ERROR_MESSAGE_MAP (constant name -> i18n key)
const apiSrc = read('apps/web/src/lib/api.ts')
const mapEntries = [
  ...apiSrc.matchAll(/\[API_ERROR_CODES\.([A-Z0-9_]+)\]:\s*'api\.errors\.([A-Za-z0-9_]+)'/g),
].map((m) => [m[1], m[2]]) // [constant name, i18n key]
const mappedNames = new Set(mapEntries.map(([name]) => name))

// Layer 3: every locale under src/locales (auto-discovered, so new languages
// are covered with no edit here). `en` is the i18n fallback, used as the baseline.
const LOCALES_DIR = 'apps/web/src/locales'
const BASE_LOCALE = 'en'
const locales = readdirSync(join(ROOT, ...LOCALES_DIR.split('/')))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const parsed = JSON.parse(read(`${LOCALES_DIR}/${f}`))
    const name = f.slice(0, -'.json'.length)
    if (!parsed.api?.errors) {
      console.error(`✗ Error-code contract check failed: ${f} is missing the "api.errors" section`)
      process.exit(1)
    }
    return { name, keys: new Set(Object.keys(parsed.api.errors)) }
  })

const errors = []
const diff = (a, b) => [...a].filter((x) => !b.has(x))

const baseLocale = locales.find((l) => l.name === BASE_LOCALE)
if (!baseLocale) {
  console.error(`✗ Error-code contract check failed: base locale "${BASE_LOCALE}.json" not found`)
  process.exit(1)
}

// 1. Every Rust code must have a TS mirror.
for (const c of diff(rustCodes, tsCodes)) {
  errors.push(`Rust code "${c}" has no mirror in api-error-codes.ts`)
}

// 2. Every TS code must be backed by Rust or registered as frontend-only
//    (guards against a stale or wrong FRONTEND_ONLY entry).
for (const c of diff(tsCodes, rustCodes)) {
  if (!FRONTEND_ONLY.has(c)) {
    errors.push(`TS code "${c}" is neither emitted by Rust nor registered in FRONTEND_ONLY`)
  }
}
for (const c of FRONTEND_ONLY) {
  if (!tsCodes.has(c)) {
    errors.push(`FRONTEND_ONLY entry "${c}" no longer exists in api-error-codes.ts`)
  }
  if (rustCodes.has(c)) {
    errors.push(`"${c}" is now a Rust-emitted code; remove it from FRONTEND_ONLY`)
  }
}

// 3. Every TS code must have an ERROR_MESSAGE_MAP entry.
//    (satisfies already guarantees this, but check independently in case satisfies is removed.)
for (const name of tsNameToValue.keys()) {
  if (!mappedNames.has(name)) {
    errors.push(`ERROR_MESSAGE_MAP is missing an entry for API_ERROR_CODES.${name}`)
  }
}

// 4. Every i18n key referenced by the map must exist in every locale.
for (const [name, key] of mapEntries) {
  for (const loc of locales) {
    if (!loc.keys.has(key)) {
      errors.push(`${loc.name}.json is missing api.errors.${key} (referenced by ${name})`)
    }
  }
}

// 5. Every locale's api.errors key set must match the base locale (no extras, no gaps).
for (const loc of locales) {
  if (loc.name === BASE_LOCALE) continue
  for (const k of diff(baseLocale.keys, loc.keys)) {
    errors.push(`api.errors.${k} is in ${BASE_LOCALE}.json but missing from ${loc.name}.json`)
  }
  for (const k of diff(loc.keys, baseLocale.keys)) {
    errors.push(`api.errors.${k} is in ${loc.name}.json but missing from ${BASE_LOCALE}.json`)
  }
}

if (errors.length > 0) {
  console.error(`✗ Error-code contract check failed (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  `✓ Error-code contract consistent (${rustCodes.size} Rust + ${FRONTEND_ONLY.size} frontend codes, ` +
    `${baseLocale.keys.size} keys across ${locales.length} locales: ${locales.map((l) => l.name).join(', ')})`,
)
