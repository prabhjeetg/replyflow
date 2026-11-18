import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { PhonePreview } from '../components/PhonePreview';
import { t } from '../i18n/translations';
import { findMatchingRule, pickRandomVariation, renderTemplate } from '../lib/matcher';
import type { AutomationRule, Language, Platform, TargetType } from '../types';

interface TestModePageProps {
  language: Language;
  rules: AutomationRule[];
}

export const TestModePage: React.FC<TestModePageProps> = ({ language, rules }) => {
  const copy = t(language);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [targetType, setTargetType] = useState<TargetType>('all_posts');
  const [mediaId, setMediaId] = useState('');
  const [username, setUsername] = useState('priya_sharma');
  const [commentText, setCommentText] = useState('Bhai link bhejo please!! 🙏🔥 लिंक');

  const [result, setResult] = useState<ReturnType<typeof findMatchingRule> | null>(null);

  const runSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    const res = findMatchingRule(rules, {
      platform,
      targetType,
      mediaId: mediaId || undefined,
      commentText,
      username,
      firstName: username.split('_')[0],
    });
    setResult(res);
  };

  const matchedRule = result?.rule;
  const vars = {
    firstName: username.split('_')[0] || username,
    username,
    commentText,
    link: matchedRule?.linkUrl || '',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.testMode.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {copy.testMode.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={runSimulation}
          className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook Page</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Event Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as TargetType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="all_posts">Post / Reel Comment</option>
                <option value="specific_post">Specific Post / Video ID</option>
                <option value="dm_keyword">Incoming DM Keyword</option>
                <option value="story_reply">Story Reply</option>
                <option value="live_comment">Live Comment</option>
              </select>
            </div>
          </div>

          {targetType === 'specific_post' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Media / Video ID</label>
              <input
                type="text"
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                placeholder="Enter media ID from rule"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Commenter Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Simulated Comment / DM Text (Hindi, Hinglish, Emoji supported)
            </label>
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            <Play className="w-4 h-4" />
            <span>{copy.testMode.simulateBtn}</span>
          </button>

          {result && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div>
                <span className="text-slate-500">{copy.testMode.normalizedOutput}: </span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  "{result.normalizedText}"
                </span>
              </div>

              {matchedRule ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                    {copy.testMode.matchedRule}: {matchedRule.name} (keyword: "{result.matchedKeyword}")
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">
                    <strong>{copy.testMode.previewDm}: </strong>
                    {renderTemplate(
                      pickRandomVariation(matchedRule.dmVariations, ''),
                      vars
                    )}
                  </div>
                  {matchedRule.publicReplyEnabled && (
                    <div className="text-slate-700 dark:text-slate-300">
                      <strong>{copy.testMode.previewPublic}: </strong>
                      {renderTemplate(
                        pickRandomVariation(matchedRule.publicReplyVariations, ''),
                        vars
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                  {copy.testMode.noMatch}. Make sure at least one active rule exists for {platform}.
                </div>
              )}
            </div>
          )}
        </form>

        <div className="lg:col-span-5">
          {matchedRule ? (
            <PhonePreview
              rule={matchedRule}
              sampleUsername={username}
              sampleComment={commentText}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-500">
              Run a simulation to inspect the live mobile DM & comment preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
