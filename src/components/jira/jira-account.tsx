'use client';

import { useState } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { JiraConnection } from '@/lib/jira/jira';
import { secondaryButton } from '@/components/ui/styles';
import { jiraResourceCache } from '@/lib/jira/jira-resource-cache';

export function JiraAccount({ connection, loading, error, onRetry }: { connection?: JiraConnection; loading: boolean; error?: string; onRetry: () => void }) {
  const [failure, setFailure] = useState(''); const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setFailure('');
    try {
      const response = await fetch('/api/jira', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error();
      jiraResourceCache.clear();
      window.location.assign(new URL('/teams', window.location.origin).href);
    } catch { setFailure('Déconnexion non confirmée. Réessayez.'); setBusy(false); }
  }
  return <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line pb-4" aria-label="Compte Jira">
    {loading ? <Loader size="text" label="Connexion Jira…" /> : <p className="min-w-0 break-words text-xs text-muted" role="status">{connection?.connected ? `Jira · ${connection.name ?? 'Connecté'}` : connection?.configured ? 'Jira · Non connecté' : 'Jira · Non configuré'}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {connection?.connected && <button type="button" disabled={busy} className={secondaryButton} onClick={() => void logout()}><LogoutIcon fontSize="small" />Déconnexion</button>}
      <form method="post" action="/api/jira/login"><button type="submit" disabled={!connection?.configured || loading || busy} className={secondaryButton}><LoginIcon fontSize="small" />{connection?.connected ? 'Reconnecter Jira' : 'Se connecter à Jira'}</button></form>
      {error && <button type="button" className={secondaryButton} onClick={onRetry}><RefreshIcon fontSize="small" />Réessayer</button>}
    </div>
    {(error || failure) && <p role="alert" className="basis-full text-xs text-danger">{failure || error}</p>}
  </div>;
}