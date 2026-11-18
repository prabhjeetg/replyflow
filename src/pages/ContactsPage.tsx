import React, { useState } from 'react';
import { Ban, CheckCircle2, Search } from 'lucide-react';
import { t } from '../i18n/translations';
import type { Contact, Language } from '../types';

interface ContactsPageProps {
  language: Language;
  contacts: Contact[];
  onToggleBlock: (contact: Contact) => Promise<void>;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({
  language,
  contacts,
  onToggleBlock,
}) => {
  const copy = t(language);
  const [search, setSearch] = useState('');

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    return c.username.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.contacts.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.contacts.subtitle}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search @username..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
          {copy.contacts.empty}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Platform</th>
                <th className="py-3 px-4 font-medium">Interactions</th>
                <th className="py-3 px-4 font-medium">Last Seen</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-medium">@{c.username}</td>
                  <td className="py-3 px-4 capitalize">{c.platform}</td>
                  <td className="py-3 px-4 font-mono tabular-nums">{c.totalInteractions || 1}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                    {new Date(c.lastInteractedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    {c.optedOut ? (
                      <span className="text-amber-600 font-medium">{copy.contacts.optedOut}</span>
                    ) : c.blocked ? (
                      <span className="text-rose-600 font-medium">{copy.contacts.blocked}</span>
                    ) : (
                      <span className="text-emerald-600 font-medium">{copy.contacts.active}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onToggleBlock(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {c.blocked ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{copy.contacts.unblock}</span>
                        </>
                      ) : (
                        <>
                          <Ban className="w-3.5 h-3.5 text-rose-600" />
                          <span>{copy.contacts.block}</span>
                        </>
                      )}
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
