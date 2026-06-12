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
    violations.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
  }
}

if (violations.length > 0) {
  console.error('Disallowed licenses in production dependencies:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('All production dependency licenses are MIT/Apache-2.0/BSD/ISC.');
