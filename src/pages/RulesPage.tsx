import React, { useState } from 'react';
import { Copy, Edit3, Plus, Power, Trash2 } from 'lucide-react';
import { RuleEditorModal } from '../components/RuleEditorModal';
import { t } from '../i18n/translations';
import type { AutomationRule, Language, Platform, SocialAccount } from '../types';

interface RulesPageProps {
  language: Language;
  rules: AutomationRule[];
  accounts: SocialAccount[];
  onCreateRule: (payload: Omit<AutomationRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateRule: (id: string, payload: Partial<AutomationRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
}

export const RulesPage: React.FC<RulesPageProps> = ({
  language,
  rules,
  accounts,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}) => {
  const copy = t(language);
  const [filterPlatform, setFilterPlatform] = useState<'all' | Platform>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const filtered = rules.filter((r) =>
    filterPlatform === 'all' ? true : r.platform === filterPlatform
  );

  const handleDuplicate = async (rule: AutomationRule) => {
    const { id: _id, userId: _u, createdAt: _c, updatedAt: _up, triggerCount: _tc, dmSentCount: _dc, ...rest } = rule;
    await onCreateRule({
      ...rest,
      name: `${rule.name} (Copy)`,
      status: 'paused',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{copy.rules.title}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
            {(['all', 'instagram', 'facebook', 'youtube'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  filterPlatform === p
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p === 'all' ? copy.rules.allPlatforms : p}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{copy.rules.createRule}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <h2 className="text-base font-semibold">{copy.rules.emptyTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {copy.rules.emptyDesc}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            {copy.rules.createRule}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold truncate">{rule.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{rule.platform}</span>
                      <span aria-hidden="true">·</span>
                      <span>{rule.targetType.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{rule.dmFlow.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRule(rule.id, {
                        status: rule.status === 'active' ? 'paused' : 'active',
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 ${
                      rule.status === 'active'
                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{rule.status === 'active' ? 'Active' : 'Paused'}</span>
                  </button>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <span className="text-slate-400">Keywords: </span>
                  {rule.matchMode === 'any_comment'
                    ? 'Any comment (*)'
                    : (rule.keywords || []).join(', ')}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="text-xs font-mono tabular-nums text-slate-500">
                  Sent: {rule.dmSentCount || 0} · Cap: {rule.dailyCap}/day
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRule(rule);
                      setModalOpen(true);
                    }}
                    title={copy.rules.editRule}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(rule)}
                    title={copy.rules.duplicate}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                    title={copy.rules.delete}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <RuleEditorModal
          language={language}
          accounts={accounts}
          initialRule={editingRule}
          onClose={() => setModalOpen(false)}
          onSave={async (payload) => {
            if (editingRule) {
              await onUpdateRule(editingRule.id, payload);
            } else {
              await onCreateRule(payload);
            }
          }}
        />
      )}
    </div>
  );
};
