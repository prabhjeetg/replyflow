import React, { useState } from 'react';
import { Check, Globe, Shield, Zap } from 'lucide-react';
import { t } from '../i18n/translations';
import { loginWithGoogle } from '../lib/firebase';
import type { Language } from '../types';

interface LoginPageProps {
  language: Language;
  onToggleLanguage: () => void;
  firebaseConfigured: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  language,
  onToggleLanguage,
  firebaseConfigured,
}) => {
  const copy = t(language);
  const isHi = language === 'hi';
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInAppFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavingConfig(true);
    try {
      const parsed = JSON.parse(configJson);
      if (!parsed.apiKey || !parsed.projectId) {
        setError('Invalid Firebase Web Config JSON: apiKey and projectId are required.');
        setSavingConfig(false);
        return;
      }

      const res = await fetch('/api/bootstrap-firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webConfigJson: configJson,
          serviceAccountJson: serviceAccountJson.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Firebase config');
      }

      localStorage.setItem('replyflow_firebase_config', JSON.stringify(parsed));
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid JSON format. Copy the firebaseConfig object from Firebase Console.'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-6 lg:px-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-8">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          {copy.appName}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{copy.header.languageLabel}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
              {copy.login.title}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              {copy.login.subtitle}
            </p>
            <ul className="space-y-3 pt-2">
              {copy.login.features.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">{copy.appName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instagram · Facebook · YouTube
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              {firebaseConfigured ? (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <Shield className="w-4 h-4" />
                  <span>{loading ? 'Signing in...' : copy.login.googleBtn}</span>
                </button>
              ) : (
                <form onSubmit={handleSaveInAppFirebase} className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="font-semibold">
                      {isHi ? 'ऐप के अंदर Firebase सेटअप करें' : 'In-App Firebase Setup'}
                    </div>
                    <div>
                      {isHi
                        ? 'बिना किसी env var के सीधे यहीं अपना Firebase Web Config JSON डालें। (Service Account JSON आप बाद में Settings में भी डाल सकते हैं।)'
                        : 'Paste your Firebase Web Config JSON directly here — no external env vars needed. You can also add your Service Account JSON now or later in Settings.'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Firebase Web App JSON *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={configJson}
                      onChange={(e) => setConfigJson(e.target.value)}
                      placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Firebase Service Account JSON ({isHi ? 'वैकल्पिक — Webhooks के लिए' : 'Optional — for server webhooks'})
                    </label>
                    <textarea
                      rows={2}
                      value={serviceAccountJson}
                      onChange={(e) => setServiceAccountJson(e.target.value)}
                      placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingConfig ? 'Saving...' : copy.login.saveConfigBtn}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
