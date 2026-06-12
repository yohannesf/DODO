import type { HealthResponse } from '@dodo/shared';

export interface HealthDeps {
  dbPing: () => Promise<boolean>;
  version: string;
}

export async function checkHealth(deps: HealthDeps): Promise<HealthResponse> {
  return {
    status: 'ok',
    db: await deps.dbPing(),
    version: deps.version,
    time: new Date().toISOString(),
  };
}
