import React, { useEffect, useState } from 'react';
import { Check, Copy, Lock } from 'lucide-react';
import { t } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import { getResolvedAppUrl } from '../lib/firebase';
import type { Language, UserSettings } from '../types';

interface SettingsPageProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ language, onLanguageChange }) => {
  const copy = t(language);
  const appUrl = getResolvedAppUrl();
  const webhookUrl = `${appUrl}/webhooks/meta`;
  const metaCallbackUrl = `${appUrl}/auth/meta/callback`;
  const ytCallbackUrl = `${appUrl}/auth/youtube/callback`;

  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [hasMetaAppSecret, setHasMetaAppSecret] = useState(false);
  const [metaVerifyToken, setMetaVerifyToken] = useState('replyflow_verify_token');
  const [youtubeClientId, setYoutubeClientId] = useState('');
  const [youtubeClientSecret, setYoutubeClientSecret] = useState('');
  const [hasYoutubeClientSecret, setHasYoutubeClientSecret] = useState(false);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [hasYoutubeApiKey, setHasYoutubeApiKey] = useState(false);

  const [minDelaySeconds, setMinDelaySeconds] = useState(3);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(15);
  const [hourlyDmLimit, setHourlyDmLimit] = useState(200);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [notificationEmail, setNotificationEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');
  const [serverAdminMissing, setServerAdminMissing] = useState(false);
  const [projectMismatch, setProjectMismatch] = useState<{
    serviceAccountProjectId: string;
    clientProjectId: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<
      UserSettings & {
        serverAdminMissing?: boolean;
        projectMismatch?: { serviceAccountProjectId: string; clientProjectId: string } | null;
      }
    >('/api/settings')
      .then((s) => {
        if (!active) return;
        setServerAdminMissing(Boolean(s.serverAdminMissing));
        setProjectMismatch(s.projectMismatch || null);
        setMetaAppId(s.metaAppId || '');
        setHasMetaAppSecret(Boolean(s.hasMetaAppSecret));
        setMetaVerifyToken(s.metaVerifyToken || 'replyflow_verify_token');
        setYoutubeClientId(s.youtubeClientId || '');
        setHasYoutubeClientSecret(Boolean(s.hasYoutubeClientSecret));
        setHasYoutubeApiKey(Boolean(s.hasYoutubeApiKey));
        setMinDelaySeconds(s.minDelaySeconds ?? 3);
        setMaxDelaySeconds(s.maxDelaySeconds ?? 15);
        setHourlyDmLimit(s.hourlyDmLimit ?? 200);
        setTimezone(s.timezone || 'Asia/Kolkata');
        setNotificationEmail(s.notificationEmail || '');
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const copyText = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    setError('');
    try {
      const updated = await apiFetch<UserSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          metaAppId,
          metaAppSecret: metaAppSecret || undefined,
          metaVerifyToken,
          youtubeClientId,
          youtubeClientSecret: youtubeClientSecret || undefined,
          youtubeApiKey: youtubeApiKey || undefined,
          minDelaySeconds: Number(minDelaySeconds),
          maxDelaySeconds: Number(maxDelaySeconds),
          hourlyDmLimit: Number(hourlyDmLimit),
          timezone,
          language,
          notificationEmail,
        }),
      });
      setHasMetaAppSecret(updated.hasMetaAppSecret);
      setHasYoutubeClientSecret(updated.hasYoutubeClientSecret);
      setHasYoutubeApiKey(updated.hasYoutubeApiKey);
      setMetaAppSecret('');
      setYoutubeClientSecret('');
      setYoutubeApiKey('');
      setSavedMsg(copy.settings.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.settings.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.settings.subtitle}</p>
      </div>

      {/* Webhook & OAuth Callback Endpoints Reference */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        {[
          { label: copy.settings.webhookUrlLabel, value: webhookUrl, key: 'wh' },
          { label: 'Meta OAuth Redirect URI', value: metaCallbackUrl, key: 'meta_cb' },
          { label: 'Google / YouTube OAuth Redirect URI', value: ytCallbackUrl, key: 'yt_cb' },
        ].map((item) => (
          <div key={item.key}>
            <div className="text-xs font-medium text-slate-500 mb-1">{item.label}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-950 text-xs font-mono truncate">
                {item.value}
              </code>
              <button
                type="button"
                onClick={() => copyText(item.value, item.key)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                {copiedField === item.key ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {serverAdminMissing && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="font-semibold">
            {projectMismatch
              ? language === 'hi'
                ? `Service Account प्रोजेक्ट मिसमैच (${projectMismatch.serviceAccountProjectId} ≠ ${projectMismatch.clientProjectId})`
                : `Service Account Project Mismatch (${projectMismatch.serviceAccountProjectId} ≠ ${projectMismatch.clientProjectId})`
              : language === 'hi'
              ? 'सर्वर Firebase Admin कीज़ सेट नहीं हैं (FIREBASE_SERVICE_ACCOUNT_JSON)'
              : 'Server Firebase Admin Not Configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)'}
          </div>
          <div>
            {projectMismatch
              ? language === 'hi'
                ? `मौजूदा FIREBASE_SERVICE_ACCOUNT_JSON प्रोजेक्ट "${projectMismatch.serviceAccountProjectId}" का है, जबकि ऐप "${projectMismatch.clientProjectId}" से जुड़ा है। सर्वर वेबहुक और YouTube पॉलिंग चालू करने के लिए "${projectMismatch.clientProjectId}" का Service Account JSON अपडेट करें। (आपकी Settings अभी भी लोकल सर्वर स्टोरेज में सेव होंगी।)`
                : `The configured FIREBASE_SERVICE_ACCOUNT_JSON belongs to "${projectMismatch.serviceAccountProjectId}", while this app uses "${projectMismatch.clientProjectId}". Update FIREBASE_SERVICE_ACCOUNT_JSON with a key for "${projectMismatch.clientProjectId}" to enable Firestore webhooks & YouTube polling. Settings can still be saved locally.`
              : language === 'hi'
              ? 'वेबहुक प्रोसेसिंग और YouTube पॉलिंग चालू करने के लिए Firebase Service Account JSON को Secrets में जोड़ें।'
              : 'Add your Firebase Service Account JSON to FIREBASE_SERVICE_ACCOUNT_JSON in Secrets to process Meta webhooks and run YouTube polling.'}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading settings...</div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6"
        >
          {/* Meta App Credentials */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>Meta (Instagram & Facebook Pages)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Meta App ID</label>
                <input
                  type="text"
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Meta App Secret {hasMetaAppSecret ? '(Stored securely — leave blank to keep)' : ''}
                </label>
                <input
                  type="password"
                  value={metaAppSecret}
                  onChange={(e) => setMetaAppSecret(e.target.value)}
                  placeholder={hasMetaAppSecret ? '••••••••••••••••' : 'Enter Meta App Secret'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Webhook Verify Token</label>
                <input
                  type="text"
                  value={metaVerifyToken}
                  onChange={(e) => setMetaVerifyToken(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* YouTube Credentials */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>YouTube Data API v3</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Google OAuth Client ID</label>
                <input
                  type="text"
                  value={youtubeClientId}
                  onChange={(e) => setYoutubeClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Google OAuth Client Secret {hasYoutubeClientSecret ? '(Stored)' : ''}
                </label>
                <input
                  type="password"
                  value={youtubeClientSecret}
                  onChange={(e) => setYoutubeClientSecret(e.target.value)}
                  placeholder={hasYoutubeClientSecret ? '••••••••••••••••' : 'Enter Client Secret'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">
                  YouTube API Key (optional fallback) {hasYoutubeApiKey ? '(Stored)' : ''}
                </label>
                <input
                  type="password"
                  value={youtubeApiKey}
                  onChange={(e) => setYoutubeApiKey(e.target.value)}
                  placeholder={hasYoutubeApiKey ? '••••••••••••••••' : 'AIza...'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Safety, Rate Limits & Preferences */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Spam Protection & Preferences</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Min Delay (sec)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={minDelaySeconds}
                  onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Delay (sec)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={maxDelaySeconds}
                  onChange={(e) => setMaxDelaySeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hourly DM Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={hourlyDmLimit}
                  onChange={(e) => setHourlyDmLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">UI Language</label>
                <select
                  value={language}
                  onChange={(e) => onLanguageChange(e.target.value as Language)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Alert Email</label>
                <input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : copy.settings.saveSettings}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
