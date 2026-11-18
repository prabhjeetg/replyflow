import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, RefreshCw, Server, Upload } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFirebaseAuth } from '../lib/firebase';
import type { Language } from '../types';

export type EnvProfileId = 'development' | 'production' | 'local';

interface EnvVarItem {
  key: string;
  value: string;
  isSecret: boolean;
  configured: boolean;
  description: string;
}

interface EnvProfileSummary {
  id: EnvProfileId;
  label: string;
  fileName: string;
  active: boolean;
  appUrl: string;
  webhookUrl: string;
  metaRedirectUri: string;
  youtubeRedirectUri: string;
  vars: EnvVarItem[];
}

interface EnvironmentsResponse {
  activeProfile: EnvProfileId;
  profiles: EnvProfileSummary[];
}

interface EnvironmentManagerProps {
  language: Language;
  onEnvironmentApplied?: () => void;
}

export const EnvironmentManager: React.FC<EnvironmentManagerProps> = ({
  language,
  onEnvironmentApplied,
}) => {
  const [data, setData] = useState<EnvironmentsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<EnvProfileId>('development');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [rawDotEnv, setRawDotEnv] = useState('');
  const [showRawImport, setShowRawImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const hydrateDraft = useCallback((profile: EnvProfileSummary) => {
    const next: Record<string, string> = {};
    for (const v of profile.vars) {
      next[v.key] = v.value;
    }
    setDraftValues(next);
  }, []);

  const loadEnvironments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<EnvironmentsResponse>('/api/environments');
      setData(res);
      const target =
        res.profiles.find((p) => p.id === selectedId) ||
        res.profiles.find((p) => p.active) ||
        res.profiles[0];
      if (target) {
        setSelectedId(target.id);
        hydrateDraft(target);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hydrateDraft, selectedId]);

  useEffect(() => {
    void loadEnvironments();
  }, [loadEnvironments]);

  const activeProfileObj = data?.profiles.find((p) => p.id === selectedId);

  const handleSelectProfile = (profile: EnvProfileSummary) => {
    setSelectedId(profile.id);
    hydrateDraft(profile);
    setStatusMsg('');
    setErrorMsg('');
  };

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  const handleApply = async (options?: {
    activate?: boolean;
    regenerateSecrets?: boolean;
    useRawImport?: boolean;
  }) => {
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await apiFetch<EnvironmentsResponse & { appliedKeys: string[] }>(
        '/api/environments/apply',
        {
          method: 'POST',
          body: JSON.stringify({
            id: selectedId,
            updates: options?.useRawImport ? undefined : draftValues,
            rawDotEnv: options?.useRawImport ? rawDotEnv : undefined,
            activate: options?.activate ?? true,
            regenerateSecrets: options?.regenerateSecrets ?? false,
          }),
        }
      );
      setData({ activeProfile: res.activeProfile, profiles: res.profiles });
      const updatedTarget = res.profiles.find((p) => p.id === selectedId);
      if (updatedTarget) hydrateDraft(updatedTarget);
      if (options?.useRawImport) {
        setRawDotEnv('');
        setShowRawImport(false);
      }
      setStatusMsg(
        language === 'hi'
          ? `${selectedId} एनवायरनमेंट सेव और सक्रिय कर दिया गया है (.env अपडेट हो गया)।`
          : `${selectedId} environment saved and activated (.env updated).`
      );
      onEnvironmentApplied?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      const auth = getFirebaseAuth();
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(`/api/environments/${selectedId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        selectedId === 'development'
          ? '.env.development'
          : selectedId === 'production'
          ? '.env.production'
          : '.env.local';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            <span>
              {language === 'hi'
                ? 'एनवायरनमेंट्स (.env.development / .env.production / .env.local)'
                : 'Environments (.env.development / .env.production / .env.local)'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'hi'
              ? 'तीनों एनवायरनमेंट फाइलें और सुरक्षा कुंजियाँ (ENCRYPTION_KEY, Verify Token) तैयार हैं। आप यहीं से किसी भी एनवायरनमेंट को एडिट, एक्टिवेट या डाउनलोड कर सकते हैं।'
              : 'Ready-made Development, Production, and Local environments with generated secrets. Edit, activate to .env, or download for Render / Cloud Run.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRawImport((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{language === 'hi' ? '.env पेस्ट करें' : 'Paste .env'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{language === 'hi' ? 'डाउनलोड .env' : 'Download .env'}</span>
          </button>
        </div>
      </div>

      {/* Environment Tabs */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {data.profiles.map((profile) => {
            const isSelected = profile.id === selectedId;
            const configuredCount = profile.vars.filter((v) => v.configured).length;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelectProfile(profile)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold capitalize text-slate-900 dark:text-white">
                    {profile.id}
                  </span>
                  {profile.active && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {language === 'hi' ? 'सक्रिय' : 'Active'}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-mono text-slate-500 truncate">
                  {profile.fileName}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {configuredCount}/{profile.vars.length} {language === 'hi' ? 'सेट' : 'configured'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Bulk .env Paste Drawer */}
      {showRawImport && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {language === 'hi'
              ? `सीधा .env कंटेंट पेस्ट करें (${selectedId} में सेव होगा):`
              : `Paste raw .env key=value lines (applies to ${selectedId}):`}
          </div>
          <textarea
            rows={5}
            value={rawDotEnv}
            onChange={(e) => setRawDotEnv(e.target.value)}
            placeholder={'VITE_FIREBASE_API_KEY="AIza..."\nMETA_APP_ID="123456"\nMETA_APP_SECRET="abcdef"'}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRawImport(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {language === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={saving || !rawDotEnv.trim()}
              onClick={() => void handleApply({ activate: true, useRawImport: true })}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {language === 'hi' ? 'इम्पोर्ट और सेव करें' : 'Import & Apply'}
            </button>
          </div>
        </div>
      )}

      {loading || !activeProfileObj ? (
        <div className="text-xs text-slate-500">Loading environment profiles...</div>
      ) : (
        <div className="space-y-4">
          {/* Quick URLs for this environment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            {[
              { key: 'wh', label: 'Webhook URL', value: activeProfileObj.webhookUrl },
              { key: 'meta', label: 'Meta Redirect URI', value: activeProfileObj.metaRedirectUri },
              { key: 'yt', label: 'YouTube Redirect URI', value: activeProfileObj.youtubeRedirectUri },
            ].map((u) => (
              <div key={u.key} className="min-w-0">
                <div className="text-[10px] font-medium text-slate-500">{u.label}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <code className="flex-1 text-[11px] font-mono truncate text-slate-700 dark:text-slate-300">
                    {u.value}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(u.value, `${activeProfileObj.id}_${u.key}`)}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
                  >
                    {copiedKey === `${activeProfileObj.id}_${u.key}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Variables Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeProfileObj.vars.map((v) => (
              <div key={v.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 truncate">
                    {v.key}
                  </label>
                  <span
                    className={`text-[10px] font-medium ${
                      v.configured ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {v.configured
                      ? language === 'hi'
                        ? 'सेट है'
                        : 'Set'
                      : language === 'hi'
                      ? 'खाली'
                      : 'Empty'}
                  </span>
                </div>
                <input
                  type="text"
                  value={draftValues[v.key] ?? ''}
                  onChange={(e) =>
                    setDraftValues((prev) => ({
                      ...prev,
                      [v.key]: e.target.value,
                    }))
                  }
                  placeholder={v.description}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleApply({ activate: true, regenerateSecrets: true })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {language === 'hi'
                  ? 'नई Encryption & Verify Keys बनाएँ'
                  : 'Regenerate Secrets'}
              </span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleApply({ activate: true })}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving
                ? language === 'hi'
                  ? 'सेव हो रहा है...'
                  : 'Applying...'
                : language === 'hi'
                ? `${selectedId} को सेव और एक्टिवेट करें (.env)`
                : `Save & Activate ${selectedId} (.env)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
