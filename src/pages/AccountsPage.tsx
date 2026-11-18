import React, { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { t } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import type { Language, SocialAccount } from '../types';

interface AccountsPageProps {
  language: Language;
  accounts: SocialAccount[];
  onDisconnect: (accountId: string) => Promise<void>;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({
  language,
  accounts,
  onDisconnect,
}) => {
  const copy = t(language);
  const [manualToken, setManualToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [pollingYt, setPollingYt] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setMessage(`Connected ${event.data.platform} account successfully.`);
        setError('');
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setError(event.data.message || 'OAuth failed');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const openOAuthPopup = async (endpoint: string) => {
    setError('');
    setMessage('');
    try {
      const { url } = await apiFetch<{ url: string }>(endpoint);
      const popup = window.open(url, 'replyflow_oauth', 'width=620,height=720');
      if (!popup) {
        setError('Popup blocked! Please allow popups in your browser for OAuth login.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setConnecting(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ connected: string[] }>('/api/accounts/manual-meta', {
        method: 'POST',
        body: JSON.stringify({ accessToken: manualToken.trim() }),
      });
      setMessage(`Connected: ${res.connected.join(', ')}`);
      setManualToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async (accountId: string) => {
    setRefreshingId(accountId);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ tokenExpiresAt: string }>(
        `/api/accounts/${accountId}/refresh`,
        { method: 'POST' }
      );
      setMessage(`Token refreshed! New expiry: ${new Date(res.tokenExpiresAt).toLocaleDateString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingId(null);
    }
  };

  const handlePollYoutubeNow = async () => {
    setPollingYt(true);
    setError('');
    try {
      await apiFetch('/api/youtube/poll-now', { method: 'POST' });
      setMessage('YouTube comment polling cycle completed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPollingYt(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.accounts.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.accounts.subtitle}</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}

      {/* OAuth Connect Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Meta (Instagram Business + Facebook Page)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requires Meta App ID & App Secret in Settings. Automatically subscribes Page & IG webhooks.
          </p>
          <button
            type="button"
            onClick={() => openOAuthPopup('/api/oauth/meta/url')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
          >
            <ExternalLink className="w-4 h-4" />
            <span>{copy.accounts.connectMeta}</span>
          </button>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold">YouTube Channel (Google OAuth)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{copy.accounts.ytNote}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openOAuthPopup('/api/oauth/youtube/url')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium hover:opacity-90"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{copy.accounts.connectYoutube}</span>
            </button>
            <button
              type="button"
              onClick={handlePollYoutubeNow}
              disabled={pollingYt}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pollingYt ? 'animate-spin' : ''}`} />
              <span>Poll YouTube Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Developer Mode Manual Long-Lived Token Connect */}
      <form
        onSubmit={handleManualConnect}
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="w-4 h-4 text-indigo-600" />
          <span>{copy.accounts.manualToken}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Fastest way in Meta Development Mode: paste your Long-Lived User/Page Token generated from Meta Graph API Explorer.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="EAABsbCS1iHgBA..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
          />
          <button
            type="submit"
            disabled={connecting}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {connecting ? 'Connecting...' : 'Connect Token'}
          </button>
        </div>
      </form>

      {/* Connected Accounts List */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            No social accounts connected yet.
          </div>
        ) : (
          accounts.map((acc) => (
            <div
              key={acc.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                {acc.profilePictureUrl ? (
                  <img
                    src={acc.profilePictureUrl}
                    alt={acc.username}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover bg-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                    {acc.platform[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {acc.displayName || acc.username}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                    <span className="capitalize">{acc.platform}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        acc.status === 'connected'
                          ? 'text-emerald-600 font-medium'
                          : 'text-rose-600 font-medium'
                      }
                    >
                      {acc.status}
                    </span>
                    {acc.tokenExpiresAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {copy.accounts.expiresAt}: {new Date(acc.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRefresh(acc.id)}
                  disabled={refreshingId === acc.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === acc.id ? 'animate-spin' : ''}`} />
                  <span>{copy.accounts.refreshToken}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDisconnect(acc.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{copy.accounts.disconnect}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
