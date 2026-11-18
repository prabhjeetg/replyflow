import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { t } from '../i18n/translations';
import type { AutomationRule, DailyStat, Language, SocialAccount } from '../types';

interface AnalyticsPageProps {
  language: Language;
  stats: DailyStat[];
  rules: AutomationRule[];
  accounts: SocialAccount[];
  onGoToRules: () => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  language,
  stats,
  rules,
  accounts,
  onGoToRules,
}) => {
  const copy = t(language);
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');

  const filteredStats = useMemo(() => {
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return [...stats]
      .filter((s) => s.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [stats, range]);

  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, s) => {
        acc.comments += s.commentsReceived || 0;
        acc.sent += s.dmsSent || 0;
        acc.delivered += s.dmsDelivered || 0;
        acc.failed += s.dmsFailed || 0;
        acc.buttons += s.buttonClicks || 0;
        acc.links += s.linkClicks || 0;
        acc.followConv += s.followGateConversions || 0;
        acc.leads += s.leadsCaptured || 0;
        return acc;
      },
      {
        comments: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        buttons: 0,
        links: 0,
        followConv: 0,
        leads: 0,
      }
    );
  }, [filteredStats]);

  const topRules = useMemo(() => {
    return [...rules]
      .sort((a, b) => (b.dmSentCount || 0) - (a.dmSentCount || 0))
      .slice(0, 5);
  }, [rules]);

  const youtubeAccounts = accounts.filter((a) => a.platform === 'youtube');
  const todayStr = new Date().toISOString().slice(0, 10);
  const ytQuotaUsed = youtubeAccounts.reduce((max, a) => {
    const val = a.youtubeQuotaResetDate === todayStr ? a.youtubeQuotaUsedToday || 0 : 0;
    return Math.max(max, val);
  }, 0);
  const ytQuotaPct = Math.min(100, Math.round((ytQuotaUsed / 10000) * 100));

  const kpis = [
    { label: copy.analytics.commentsReceived, value: totals.comments },
    { label: copy.analytics.dmsSent, value: totals.sent },
    { label: copy.analytics.deliveredRate, value: totals.delivered },
    { label: copy.analytics.failedDms, value: totals.failed },
    { label: copy.analytics.buttonClicks, value: totals.buttons },
    { label: copy.analytics.linkClicks, value: totals.links },
    { label: copy.analytics.followGateConv, value: totals.followConv },
    { label: copy.analytics.leadsCaptured, value: totals.leads },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Segmented Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{copy.analytics.title}</h1>
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 self-start">
          {(['today', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                range === r
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r === 'today'
                ? copy.analytics.rangeToday
                : r === '7d'
                ? copy.analytics.range7d
                : copy.analytics.range30d}
            </button>
          ))}
        </div>
      </div>

      {/* 8-Card KPI Grid with Tabular Numerals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{kpi.label}</div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {kpi.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* YouTube Quota Meter */}
      {youtubeAccounts.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{copy.analytics.ytQuotaTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {copy.analytics.ytQuotaDesc}
              </p>
            </div>
            <span className="text-sm font-mono tabular-nums font-semibold">
              {ytQuotaUsed.toLocaleString()} / 10,000 units ({ytQuotaPct}%)
            </span>
          </div>
          <div className="mt-3 h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all ${
                ytQuotaPct >= 90 ? 'bg-rose-600' : ytQuotaPct >= 70 ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${ytQuotaPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Charts & Top Rules */}
      {filteredStats.length === 0 && rules.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">{copy.analytics.noDataYet}</p>
          <button
            type="button"
            onClick={onGoToRules}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            {copy.analytics.createFirstRule}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Trend Chart */}
          <div className="lg:col-span-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="text-sm font-semibold mb-4">{copy.analytics.activityChart}</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="commentsReceived"
                    name={copy.analytics.commentsReceived}
                    stroke="#6366F1"
                    fill="#6366F1"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="dmsSent"
                    name={copy.analytics.dmsSent}
                    stroke="#16A34A"
                    fill="#16A34A"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Rules & Conversion Bar */}
          <div className="lg:col-span-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
            <h2 className="text-sm font-semibold mb-4">{copy.analytics.topRules}</h2>
            {topRules.length === 0 ? (
              <p className="text-xs text-slate-500">No rules created yet.</p>
            ) : (
              <>
                <div className="space-y-3 flex-1">
                  {topRules.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.platform} · {r.dmFlow}
                        </div>
                      </div>
                      <span className="text-sm font-mono tabular-nums font-semibold">
                        {(r.dmSentCount || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="h-32 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredStats.slice(-7)}>
                      <XAxis dataKey="date" hide />
                      <Tooltip />
                      <Bar dataKey="leadsCaptured" name={copy.analytics.leadsCaptured} fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
