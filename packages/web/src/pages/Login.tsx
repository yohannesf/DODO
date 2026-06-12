import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Field, Input } from '../components';
import { useAuth } from '../auth/store';
import { t } from '../i18n';
import { startSyncLoop } from '../sync/engine';

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      startSyncLoop();
      await navigate({ to: '/enter' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper">
      <form onSubmit={submit} className="w-80 border border-ink bg-surface p-6">
        <p className="font-mono text-lg font-medium tracking-tight">DODO</p>
        <p className="small-caps mt-0.5 mb-5 text-ink-muted">{t('app.tagline')}</p>
        <div className="space-y-3">
          <Field label={t('login.username')}>
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label={t('login.password')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
            />
          </Field>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-[12px] text-offtrack">
            ▲ {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          className="mt-5 w-full justify-center"
          disabled={busy || !username || !password}
        >
          {t('login.signIn')}
        </Button>
      </form>
    </main>
  );
}
