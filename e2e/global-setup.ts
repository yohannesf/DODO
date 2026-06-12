// Starts a disposable Postgres (PostGIS) and the DODO server (serving the
// built SPA) for the admin/server-backed e2e projects. The offline-shell
// project keeps using the static vite preview web server.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER_PORT = 3100;

async function waitForHealth(url: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server at ${url} never became healthy`);
}

export default async function globalSetup() {
  execSync('pnpm turbo build --filter=@dodo/server --filter=@dodo/web', {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const container = await new PostgreSqlContainer('postgis/postgis:16-3.5').start();

  const server: ChildProcess = spawn(
    'node',
    [path.join(repoRoot, 'packages/server/dist/index.js')],
    {
      env: {
        ...process.env,
        DATABASE_URL: container.getConnectionUri(),
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        WEB_DIST_DIR: path.join(repoRoot, 'packages/web/dist'),
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    },
  );

  await waitForHealth(`http://127.0.0.1:${SERVER_PORT}/api/health`);

  return async () => {
    server.kill('SIGTERM');
    await container.stop();
  };
}
