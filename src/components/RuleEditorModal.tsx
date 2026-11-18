import React, { useState } from 'react';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import { t } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import type {
  AutomationRule,
  DmFlowType,
  Language,
  MatchMode,
  MediaItem,
  SocialAccount,
  TargetType,
} from '../types';
import { PhonePreview } from './PhonePreview';

interface RuleEditorModalProps {
  language: Language;
  accounts: SocialAccount[];
  initialRule?: AutomationRule | null;
  onClose: () => void;
  onSave: (rulePayload: Omit<AutomationRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

export const RuleEditorModal: React.FC<RuleEditorModalProps> = ({
  language,
  accounts,
  initialRule,
  onClose,
  onSave,
}) => {
  const copy = t(language);
  const firstAccount = accounts[0];

  const [accountId, setAccountId] = useState(initialRule?.accountId || firstAccount?.id || '');
  const selectedAccount = accounts.find((a) => a.id === accountId) || firstAccount;
  const platform = selectedAccount?.platform || initialRule?.platform || 'instagram';

  const [name, setName] = useState(initialRule?.name || '');
  const [targetType, setTargetType] = useState<TargetType>(initialRule?.targetType || 'all_posts');
  const [targetMediaId, setTargetMediaId] = useState(initialRule?.targetMediaId || '');
  const [targetMediaTitle, setTargetMediaTitle] = useState(initialRule?.targetMediaTitle || '');
  const [targetMediaThumbnail, setTargetMediaThumbnail] = useState(
    initialRule?.targetMediaThumbnail || ''
  );

  const [keywordsStr, setKeywordsStr] = useState(
    initialRule?.keywords?.join(', ') || 'link, लिंक, price, guide'
  );
  const [excludeStr, setExcludeStr] = useState(initialRule?.excludeKeywords?.join(', ') || '');
  const [matchMode, setMatchMode] = useState<MatchMode>(initialRule?.matchMode || 'contains');
  const [dmFlow, setDmFlow] = useState<DmFlowType>(initialRule?.dmFlow || 'two_step');

  const [dmVariationsText, setDmVariationsText] = useState(
    initialRule?.dmVariations?.join('\n') ||
      'Hey {first_name}! Thanks for commenting "{comment_text}". Here is your link: {link}\nHi {first_name}, sent you the requested resource right here: {link}'
  );
  const [step1Message, setStep1Message] = useState(
    initialRule?.step1Message || 'Hey {first_name}! Tap the button below and I will send your link.'
  );
  const [step1ButtonText, setStep1ButtonText] = useState(
    initialRule?.step1ButtonText || 'Send me the link 👉'
  );
  const [followGateMessage, setFollowGateMessage] = useState(
    initialRule?.followGateMessage ||
      'Hey {first_name}! Please follow our page first, then tap below to unlock your link:'
  );
  const [followGateButtonText, setFollowGateButtonText] = useState(
    initialRule?.followGateButtonText || "I'm following ✅"
  );
  const [followGateRetryMessage, setFollowGateRetryMessage] = useState(
    initialRule?.followGateRetryMessage ||
      'Looks like you have not followed yet! Hit Follow on our profile and tap the button again.'
  );

  const [linkUrl, setLinkUrl] = useState(initialRule?.linkUrl || '');
  const [buttonLabel, setButtonLabel] = useState(initialRule?.buttonLabel || 'Open Link');
  const [imageUrl, setImageUrl] = useState(initialRule?.imageUrl || '');

  const [publicReplyEnabled, setPublicReplyEnabled] = useState(
    initialRule?.publicReplyEnabled ?? true
  );
  const [publicReplyText, setPublicReplyText] = useState(
    initialRule?.publicReplyVariations?.join('\n') ||
      'Sent you a DM! Check your inbox ✨\nCheck your message requests, {first_name}! 📩\nLink bhej diya hai DM mein! 🙌'
  );
  const [fallbackPublicReply, setFallbackPublicReply] = useState(
    initialRule?.fallbackPublicReply ||
      '@{username} Could not send DM (privacy settings). Please follow and DM us for the link!'
  );

  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(
    initialRule?.leadCaptureEnabled ?? false
  );
  const [leadCapturePrompt, setLeadCapturePrompt] = useState(
    initialRule?.leadCapturePrompt ||
      'Want free bonus templates? Reply with your email or WhatsApp number!'
  );

  const [oneDmPerUser, setOneDmPerUser] = useState(initialRule?.oneDmPerUser ?? true);
  const [cooldownHours, setCooldownHours] = useState(initialRule?.cooldownHours ?? 24);
  const [dailyCap, setDailyCap] = useState(initialRule?.dailyCap ?? 500);
  const [scheduleStart, setScheduleStart] = useState(initialRule?.scheduleStart || '');
  const [scheduleEnd, setScheduleEnd] = useState(initialRule?.scheduleEnd || '');

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleLoadMedia = async () => {
    if (!accountId) return;
    setLoadingMedia(true);
    setMediaError('');
    try {
      const res = await apiFetch<{ items: MediaItem[] }>(`/api/accounts/${accountId}/media`);
      setMediaList(res.items || []);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMedia(false);
    }
  };

  const parsedRulePreview: Partial<AutomationRule> = {
    platform,
    dmFlow,
    dmVariations: dmVariationsText.split('\n').filter(Boolean),
    step1Message,
    step1ButtonText,
    followGateMessage,
    followGateButtonText,
    linkUrl,
    buttonLabel,
    imageUrl,
    publicReplyEnabled,
    publicReplyVariations: publicReplyText.split('\n').filter(Boolean),
    leadCaptureEnabled,
    leadCapturePrompt,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      setError('Please connect at least one social account first.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter a rule name.');
      return;
    }

    const dmVariations = dmVariationsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (dmVariations.length === 0) {
      setError('Add at least 1 DM message variation.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        accountId,
        platform,
        name: name.trim(),
        status: initialRule?.status || 'active',
        targetType: platform === 'youtube' ? 'specific_post' : targetType,
        targetMediaId,
        targetMediaTitle,
        targetMediaThumbnail,
        keywords: keywordsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 30),
        excludeKeywords: excludeStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
        matchMode,
        dmFlow: platform === 'youtube' ? 'simple' : dmFlow,
        dmVariations: dmVariations.slice(0, 10),
        step1Message,
        step1ButtonText,
        followGateMessage,
        followGateButtonText,
        followGateRetryMessage,
        linkUrl: linkUrl.trim(),
        buttonLabel: buttonLabel.trim(),
        imageUrl: imageUrl.trim(),
        publicReplyEnabled: platform === 'youtube' ? true : publicReplyEnabled,
        publicReplyVariations: publicReplyText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10),
        fallbackPublicReply: fallbackPublicReply.trim(),
        leadCaptureEnabled: platform === 'youtube' ? false : leadCaptureEnabled,
        leadCapturePrompt: leadCapturePrompt.trim(),
        oneDmPerUser,
        cooldownHours: Number(cooldownHours) || 0,
        dailyCap: Number(dailyCap) || 500,
        scheduleStart: scheduleStart || '',
        scheduleEnd: scheduleEnd || '',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl my-4 max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initialRule ? copy.rules.editRule : copy.rules.createRule}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Form Column */}
            <div className="lg:col-span-7 space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {copy.rules.ruleName}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Free Notion Template Reel"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {copy.rules.account}
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {accounts.length === 0 && <option value="">No accounts connected</option>}
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.platform.toUpperCase()} — @{acc.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {platform === 'youtube' && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                  {copy.rules.ytNoDmNotice}
                </div>
              )}

              {/* Target Selection */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {copy.rules.targetType}
                </label>
                <select
                  value={platform === 'youtube' ? 'specific_post' : targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  disabled={platform === 'youtube'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="all_posts">{copy.rules.allPosts}</option>
                  <option value="specific_post">{copy.rules.specificPost}</option>
                  <option value="dm_keyword">{copy.rules.dmKeyword}</option>
                  <option value="story_reply">{copy.rules.storyReply}</option>
                  <option value="live_comment">{copy.rules.liveComment}</option>
                </select>

                {(targetType === 'specific_post' || platform === 'youtube') && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={targetMediaId}
                        onChange={(e) => setTargetMediaId(e.target.value)}
                        placeholder={
                          platform === 'youtube' ? 'YouTube Video / Short ID' : 'Post / Reel Media ID'
                        }
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleLoadMedia}
                        disabled={loadingMedia || !accountId}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        {loadingMedia ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                        <span>{loadingMedia ? copy.rules.loadingMedia : copy.rules.pickMedia}</span>
                      </button>
                    </div>

                    {mediaError && <p className="text-xs text-rose-600">{mediaError}</p>}

                    {mediaList.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pt-1">
                        {mediaList.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setTargetMediaId(m.id);
                              setTargetMediaTitle(m.title);
                              setTargetMediaThumbnail(m.thumbnailUrl || '');
                            }}
                            className={`text-left rounded-lg border p-1.5 transition-colors ${
                              targetMediaId === m.id
                                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {m.thumbnailUrl ? (
                              <img
                                src={m.thumbnailUrl}
                                alt={m.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-16 object-cover rounded"
                              />
                            ) : (
                              <div className="w-full h-16 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                            <p className="mt-1 text-[11px] truncate text-slate-700 dark:text-slate-300">
                              {m.title}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Keywords & Match Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {copy.rules.keywords}
                  </label>
                  <input
                    type="text"
                    value={keywordsStr}
                    onChange={(e) => setKeywordsStr(e.target.value)}
                    disabled={matchMode === 'any_comment'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {copy.rules.matchMode}
                  </label>
                  <select
                    value={matchMode}
                    onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    <option value="contains">Contains</option>
                    <option value="exact">Exact Match</option>
                    <option value="starts_with">Starts With</option>
                    <option value="any_comment">Match Any Comment</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {copy.rules.excludeKeywords}
                </label>
                <input
                  type="text"
                  value={excludeStr}
                  onChange={(e) => setExcludeStr(e.target.value)}
                  placeholder="spam, scam, fake"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {/* DM Flow */}
              {platform !== 'youtube' && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {copy.rules.dmFlow}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['simple', 'two_step', 'follow_gate'] as DmFlowType[]).map((flow) => (
                      <button
                        key={flow}
                        type="button"
                        onClick={() => setDmFlow(flow)}
                        className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-colors ${
                          dmFlow === flow
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {flow === 'simple'
                          ? copy.rules.flowSimple
                          : flow === 'two_step'
                          ? copy.rules.flowTwoStep
                          : copy.rules.flowFollowGate}
                      </button>
                    ))}
                  </div>

                  {dmFlow === 'two_step' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={step1Message}
                        onChange={(e) => setStep1Message(e.target.value)}
                        placeholder="Step 1 message"
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                      />
                      <input
                        type="text"
                        value={step1ButtonText}
                        onChange={(e) => setStep1ButtonText(e.target.value)}
                        placeholder="Button text (max 20 chars)"
                        maxLength={20}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                      />
                    </div>
                  )}

                  {dmFlow === 'follow_gate' && (
                    <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={followGateMessage}
                          onChange={(e) => setFollowGateMessage(e.target.value)}
                          placeholder="Ask to follow message"
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                        />
                        <input
                          type="text"
                          value={followGateButtonText}
                          onChange={(e) => setFollowGateButtonText(e.target.value)}
                          placeholder="Button text (e.g. I'm following)"
                          maxLength={20}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                        />
                      </div>
                      <input
                        type="text"
                        value={followGateRetryMessage}
                        onChange={(e) => setFollowGateRetryMessage(e.target.value)}
                        placeholder="Polite retry message if not following yet"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Link, Button & Optional Image */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Destination URL ({'{link}'})
                  </label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://your-link.com/resource"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Button Label
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={buttonLabel}
                    onChange={(e) => setButtonLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              {platform !== 'youtube' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Optional Image URL (Generic Template Card)
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://.../cover.jpg"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              )}

              {/* DM Variations */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {copy.rules.dmVariations}
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5 font-mono">
                  Variables: {'{first_name}'} {'{username}'} {'{comment_text}'} {'{link}'}
                </p>
                <textarea
                  rows={3}
                  value={dmVariationsText}
                  onChange={(e) => setDmVariationsText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {/* Public Reply */}
              {platform !== 'youtube' && (
                <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicReplyEnabled}
                      onChange={(e) => setPublicReplyEnabled(e.target.checked)}
                    />
                    <span>{copy.rules.publicReply}</span>
                  </label>
                  {publicReplyEnabled && (
                    <textarea
                      rows={2}
                      value={publicReplyText}
                      onChange={(e) => setPublicReplyText(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  )}
                  <input
                    type="text"
                    value={fallbackPublicReply}
                    onChange={(e) => setFallbackPublicReply(e.target.value)}
                    placeholder="Fallback public reply if DM is restricted"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
              )}

              {/* Lead Capture */}
              {platform !== 'youtube' && (
                <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={leadCaptureEnabled}
                      onChange={(e) => setLeadCaptureEnabled(e.target.checked)}
                    />
                    <span>{copy.rules.leadCapture}</span>
                  </label>
                  {leadCaptureEnabled && (
                    <input
                      type="text"
                      value={leadCapturePrompt}
                      onChange={(e) => setLeadCapturePrompt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  )}
                </div>
              )}

              {/* Rate limits & Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={oneDmPerUser}
                    onChange={(e) => setOneDmPerUser(e.target.checked)}
                  />
                  <span>{copy.rules.oneDmPerUser}</span>
                </label>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {copy.rules.cooldownHours}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={cooldownHours}
                    onChange={(e) => setCooldownHours(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {copy.rules.dailyCap}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {copy.rules.schedule} (Start)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
              </div>
              {scheduleStart && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Schedule End
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Right Phone Preview Column */}
            <div className="lg:col-span-5">
              <div className="sticky top-0 space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">
                  {copy.rules.phonePreview}
                </h3>
                <PhonePreview rule={parsedRulePreview} />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {copy.rules.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : copy.rules.saveRule}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
