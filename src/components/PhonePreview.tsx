import React from 'react';
import { ExternalLink, MessageSquare, ShieldCheck } from 'lucide-react';
import { pickRandomVariation, renderTemplate } from '../lib/matcher';
import type { AutomationRule } from '../types';

interface PhonePreviewProps {
  rule: Partial<AutomationRule>;
  sampleUsername?: string;
  sampleComment?: string;
}

export const PhonePreview: React.FC<PhonePreviewProps> = ({
  rule,
  sampleUsername = 'rohan_creates',
  sampleComment = 'link please 🙌',
}) => {
  const vars = {
    firstName: sampleUsername.split('_')[0] || 'Rohan',
    username: sampleUsername,
    commentText: sampleComment,
    link: rule.linkUrl || 'https://example.com/guide',
  };

  const dmBody = renderTemplate(
    pickRandomVariation(rule.dmVariations || [], 'Hey {first_name}! Here is your link: {link}'),
    vars
  );

  const pubReply = renderTemplate(
    pickRandomVariation(rule.publicReplyVariations || [], 'Sent you a DM! Check your inbox ✨'),
    vars
  );

  const isYoutube = rule.platform === 'youtube';

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-white p-4 max-w-[320px] mx-auto">
      {/* Phone notch bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pb-3 border-b border-slate-800">
        <span className="font-mono">
          {rule.platform === 'instagram'
            ? 'Instagram DM'
            : rule.platform === 'facebook'
            ? 'Messenger'
            : 'YouTube Comment'}
        </span>
        <span>Preview</span>
      </div>

      <div className="mt-3 space-y-3 text-xs">
        {/* Incoming Comment */}
        <div className="bg-slate-800/70 rounded-xl p-2.5 border border-slate-700/60">
          <div className="text-[11px] text-slate-400">@{sampleUsername} commented</div>
          <div className="mt-1 text-slate-100">{sampleComment}</div>
        </div>

        {/* Public Comment Reply */}
        {(rule.publicReplyEnabled || isYoutube) && (
          <div className="ml-4 bg-slate-800 rounded-xl p-2.5 border border-slate-700">
            <div className="text-[11px] text-indigo-300 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>Public Reply</span>
            </div>
            <div className="mt-1 text-slate-100">
              {isYoutube ? dmBody : pubReply}
            </div>
          </div>
        )}

        {/* DM Bubbles (Instagram & Facebook only) */}
        {!isYoutube && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            {rule.dmFlow === 'two_step' && (
              <div className="bg-indigo-600 rounded-2xl rounded-bl-sm p-3 space-y-2">
                <p className="leading-relaxed">
                  {renderTemplate(
                    rule.step1Message || 'Tap below and I will send the link right away!',
                    vars
                  )}
                </p>
                <div className="w-full py-2 px-3 rounded-lg bg-white text-slate-900 font-semibold text-center">
                  {rule.step1ButtonText || 'Send me the link 👉'}
                </div>
              </div>
            )}

            {rule.dmFlow === 'follow_gate' && (
              <div className="bg-indigo-600 rounded-2xl rounded-bl-sm p-3 space-y-2">
                <p className="leading-relaxed">
                  {renderTemplate(
                    rule.followGateMessage ||
                      'Hey {first_name}! Follow our account first, then tap below to unlock your link:',
                    vars
                  )}
                </p>
                <div className="w-full py-2 px-3 rounded-lg bg-white text-slate-900 font-semibold text-center flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{rule.followGateButtonText || "I'm following ✅"}</span>
                </div>
              </div>
            )}

            <div className="bg-slate-800 rounded-2xl rounded-bl-sm overflow-hidden border border-slate-700">
              {rule.imageUrl && (
                <img
                  src={rule.imageUrl}
                  alt="DM attachment"
                  referrerPolicy="no-referrer"
                  className="w-full h-28 object-cover bg-slate-700"
                />
              )}
              <div className="p-3 space-y-2">
                <p className="leading-relaxed text-slate-100 whitespace-pre-wrap">{dmBody}</p>
                {rule.linkUrl && (
                  <div className="w-full py-2 px-3 rounded-lg bg-indigo-600 text-white font-medium text-center flex items-center justify-center gap-1.5">
                    <span>{rule.buttonLabel || 'Open Link'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>

            {rule.leadCaptureEnabled && (
              <div className="bg-slate-800 rounded-2xl rounded-bl-sm p-3 border border-slate-700">
                <p className="text-slate-200">
                  {renderTemplate(
                    rule.leadCapturePrompt || 'Drop your email or WhatsApp number to get future freebies!',
                    vars
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
