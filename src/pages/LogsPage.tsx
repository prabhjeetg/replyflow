import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { t } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import type { AutomationLog, DmDeliveryStatus, Language } from '../types';

interface LogsPageProps {
  language: Language;
  logs: AutomationLog[];
}

export const LogsPage: React.FC<LogsPageProps> = ({ language, logs }) => {
  const copy = t(language);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DmDeliveryStatus>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== 'all' && l.dmStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.commenterUsername?.toLowerCase().includes(q) ||
        l.commentText?.toLowerCase().includes(q) ||
        l.ruleName?.toLowerCase().includes(q) ||
        (l.errorMessage || '').toLowerCase().includes(q)
      );
    });
  }, [logs, search, statusFilter]);

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Platform',
      'Username',
      'Comment',
      'Rule',
      'Keyword',
      'DM Status',
      'Public Reply',
      'Error',
    ];
    const rows = filtered.map((l) => [
      l.createdAt,
      l.platform,
      l.commenterUsername,
      `"${(l.commentText || '').replace(/"/g, '""')}"`,
      `"${(l.ruleName || '').replace(/"/g, '""')}"`,
      l.keywordMatched,
      l.dmStatus,
      l.publicReplyStatus,
      `"${(l.errorMessage || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replyflow-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = async (logId: string) => {
    setRetryingId(logId);
    setFeedback('');
    try {
      await apiFetch(`/api/logs/${logId}/retry`, { method: 'POST' });
      setFeedback('Retry queued successfully.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{copy.logs.title}</h1>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 self-start"
        >
          <Download className="w-4 h-4" />
          <span>{copy.logs.exportCsv}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">{feedback}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.logs.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | DmDeliveryStatus)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="all">{copy.logs.statusAll}</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="queued">Queued</option>
          <option value="awaiting_postback">Awaiting Button Tap</option>
          <option value="awaiting_follow">Awaiting Follow</option>
          <option value="public_only">Public Only (YouTube)</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
          {copy.logs.empty}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-3 px-4 font-medium">Time</th>
                <th className="py-3 px-4 font-medium">Platform</th>
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Comment</th>
                <th className="py-3 px-4 font-medium">Rule / Keyword</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 capitalize">{item.platform}</td>
                  <td className="py-3 px-4 font-medium">@{item.commenterUsername}</td>
                  <td className="py-3 px-4 max-w-xs truncate">{item.commentText}</td>
                  <td className="py-3 px-4">
                    <div>{item.ruleName}</div>
                    <div className="text-slate-400 font-mono">{item.keywordMatched}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-medium ${
                        item.dmStatus === 'failed'
                          ? 'text-rose-600'
                          : item.dmStatus === 'sent' || item.dmStatus === 'delivered'
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {item.dmStatus}
                    </span>
                    {item.errorMessage && (
                      <div className="text-[11px] text-rose-500 max-w-xs truncate">
                        {item.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {item.dmStatus === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleRetry(item.id)}
                        disabled={retryingId === item.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <RefreshCw className={`w-3 h-3 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                        <span>{copy.logs.retry}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
