import React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { t } from '../i18n/translations';
import type { Language, Lead } from '../types';

interface LeadsPageProps {
  language: Language;
  leads: Lead[];
  onDeleteLead: (id: string) => Promise<void>;
}

export const LeadsPage: React.FC<LeadsPageProps> = ({ language, leads, onDeleteLead }) => {
  const copy = t(language);

  const handleExportCsv = () => {
    const headers = ['Date', 'Platform', 'Username', 'Email', 'Phone', 'Rule', 'Raw Reply'];
    const rows = leads.map((l) => [
      l.createdAt,
      l.platform,
      l.username,
      l.email || '',
      l.phone || '',
      `"${(l.ruleName || '').replace(/"/g, '""')}"`,
      `"${(l.rawReply || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replyflow-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{copy.leads.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.leads.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={leads.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 self-start"
        >
          <Download className="w-4 h-4" />
          <span>{copy.leads.exportCsv}</span>
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
          {copy.leads.empty}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-3 px-4 font-medium">Captured</th>
                <th className="py-3 px-4 font-medium">Platform</th>
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Phone</th>
                <th className="py-3 px-4 font-medium">Rule</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-500">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 capitalize">{lead.platform}</td>
                  <td className="py-3 px-4 font-medium">@{lead.username}</td>
                  <td className="py-3 px-4 font-mono">{lead.email || '—'}</td>
                  <td className="py-3 px-4 font-mono">{lead.phone || '—'}</td>
                  <td className="py-3 px-4">{lead.ruleName}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteLead(lead.id)}
                      className="p-1.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
