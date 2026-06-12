#!/usr/bin/env node
// Lighthouse PWA budget (spec §10): installable + offline-capable app shell.
// Pinned to lighthouse@11 — the PWA category was removed in Lighthouse 12.
// Usage: node scripts/lighthouse-pwa.mjs [url]
// Without a url, builds are assumed done and `vite preview` is spawned.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4173/';
let preview;

async function waitFor(target, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(target);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server at ${target} never became ready`);
}

try {
  if (!process.argv[2]) {
    preview = spawn('pnpm', ['--filter', '@dodo/web', 'preview'], {
      stdio: 'ignore',
      detached: true,
    });
  }
  await waitFor(url);

  const report = path.join(mkdtempSync(path.join(tmpdir(), 'lh-')), 'report.json');
  execFileSync(
    'npx',
    [
      '-y',
      'lighthouse@11.7.1',
      url,
      '--only-categories=pwa',
      '--output=json',
      `--output-path=${report}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ],
    { stdio: 'inherit' },
  );

  const result = JSON.parse(readFileSync(report, 'utf8'));
  const pwaScore = result.categories.pwa.score;
  const installable = result.audits['installable-manifest']?.score;
  console.log(`pwa category score: ${pwaScore}, installable-manifest: ${installable}`);
  if (installable !== 1) {
    console.error('FAIL: app is not installable');
    process.exit(1);
  }
  if (pwaScore < 0.9) {
    console.error('FAIL: pwa category score below 0.9');
    process.exit(1);
  }
  console.log('Lighthouse PWA check passed.');
} finally {
  if (preview && preview.pid) process.kill(-preview.pid, 'SIGTERM');
}
