#!/usr/bin/env node
// Enforce the dependency policy from docs/DODO-SPEC.md §2.3: every runtime
// dependency must be MIT/Apache-2.0/BSD/ISC. Run as `pnpm license-check`.
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
]);

// Documented exceptions (flagged deviation from the policy's literal list).
// All are OSI/FSF-approved, permissive, non-copyleft licenses pulled in by the
// spec-mandated stack and cannot be avoided:
//   Unlicense      isbot ← @tanstack/react-router (spec §2.3 router choice)
//   BlueOak-1.0.0  glob@11 family ← @fastify/static, workbox-build
//   OFL-1.1        the self-hosted @fontsource webfonts (Archivo, IBM Plex);
//                  the SIL Open Font License is the standard font licence and
//                  imposes no terms on the application that bundles the fonts.
//   Zlib           pako ← exceljs (xlsx export, v0.2.0). The zlib licence is an
//                  OSI-approved permissive non-copyleft licence.
//   MIT/X11        traverse ← exceljs. X11 is the canonical MIT licence text;
//                  the "MIT/X11" string is just a non-SPDX spelling of MIT.
const EXCEPTIONS = new Set(['Unlicense', 'BlueOak-1.0.0', 'OFL-1.1', 'Zlib', 'MIT/X11']);
for (const e of EXCEPTIONS) ALLOWED.add(e);

// Packages whose manifest omits the license field but whose licensing is
// verified upstream:
//   @mapbox/jsonlint-lines-primitives — fork of zaach/jsonlint (MIT); the
//   fork ships no license field, the upstream LICENSE applies. Pulled in by
//   maplibre-gl (BSD-3-Clause).
//   buffers — substack/node-buffers (MIT/X11 upstream, no license field in the
//   manifest). Pulled in by exceljs → unzipper → binary (xlsx export, v0.2.0).
const KNOWN_PACKAGES = new Set(['@mapbox/jsonlint-lines-primitives', 'buffers']);

function licenseAllowed(expr) {
  if (ALLOWED.has(expr)) return true;
  // SPDX expressions: "(A OR B)" passes if any branch passes,
  // "(A AND B)" only if all branches pass.
  const inner = expr.replace(/^\(/, '').replace(/\)$/, '');
  if (inner.includes(' OR ')) return inner.split(' OR ').some(licenseAllowed);
  if (inner.includes(' AND ')) return inner.split(' AND ').every(licenseAllowed);
  return ALLOWED.has(inner.trim());
}

const raw = execSync('pnpm licenses list --prod --json', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw);

const violations = [];
for (const [license, packages] of Object.entries(byLicense)) {
  if (licenseAllowed(license)) continue;
  for (const pkg of packages) {
    if (KNOWN_PACKAGES.has(pkg.name)) continue;
    violations.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
  }
}

if (violations.length > 0) {
  console.error('Disallowed licenses in production dependencies:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(
  'All production dependency licenses are MIT/Apache-2.0/BSD/ISC ' +
    `(documented exceptions: ${[...EXCEPTIONS].join(', ')}).`,
);
