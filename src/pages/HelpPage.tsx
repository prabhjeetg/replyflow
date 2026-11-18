import React from 'react';
import { t } from '../i18n/translations';
import { getResolvedAppUrl } from '../lib/firebase';
import type { Language } from '../types';

interface HelpPageProps {
  language: Language;
}

export const HelpPage: React.FC<HelpPageProps> = ({ language }) => {
  const copy = t(language);
  const appUrl = getResolvedAppUrl();
  const isHi = language === 'hi';

  const setupSteps = isHi
    ? [
        {
          title: '1. Firebase प्रोजेक्ट बनाएं (मुफ़्त Spark प्लान)',
          body: 'console.firebase.google.com पर जाएं → नया प्रोजेक्ट बनाएं → Firestore Database (Production mode) और Authentication (Google Sign-In) चालू करें। Project Settings → Service Accounts से JSON की डाउनलोड करें और FIREBASE_SERVICE_ACCOUNT_JSON में डालें।',
        },
        {
          title: '2. Instagram को Professional अकाउंट बनाएं और Facebook Page से जोड़ें',
          body: 'Instagram ऐप → Settings → Account type → Switch to Professional Account (Creator/Business)। फिर Instagram Settings → Account Center या Linked Accounts से अपने Facebook Page को लिंक करें।',
        },
        {
          title: '3. Meta Developer App और ज़रूरी Permissions सेट करें',
          body: 'developers.facebook.com → My Apps → Create App (Business type) → Instagram और Webhooks प्रोडक्ट जोड़ें। Graph API Explorer में ये permissions चुनें: instagram_basic, instagram_manage_comments, instagram_manage_messages, pages_show_list, pages_manage_metadata, pages_read_engagement, pages_messaging।',
        },
        {
          title: '4. App Review के बिना Development Mode में चलाएं',
          body: 'Meta App Dashboard → App Roles → Roles में खुद को Admin या Tester जोड़ें। Development Mode में आपके खुद के जुड़े हुए पेज और टेस्टर अकाउंट्स पर बिना App Review के सभी ऑटोमेशन तुरंत काम करते हैं।',
        },
        {
          title: '5. Webhook URL और Verify Token सेट करें',
          body: `Meta App → Webhooks (Instagram और Page दोनों) में Callback URL डालें: ${appUrl}/webhooks/meta और Verify Token वही डालें जो Settings पेज में सेव किया है। फिर comments, messages, messaging_postbacks, live_comments और feed फ़ील्ड्स को Subscribe करें।`,
        },
        {
          title: '6. YouTube Data API v3 और OAuth जोड़ें',
          body: `console.cloud.google.com पर YouTube Data API v3 Enable करें → Credentials में Web OAuth Client बनाएं और Authorized Redirect URI में ${appUrl}/auth/youtube/callback जोड़ें। ध्यान दें: YouTube में DM नहीं होते, इसलिए रिप्लाई पब्लिक कमेंट में जाता है।`,
        },
        {
          title: '7. Render (मुफ़्त) और UptimeRobot से 24x7 ऑनलाइन रखें',
          body: `Render.com पर फ्री वेब सर्विस बनाएं। फ्री सर्वर 15 मिनट निष्क्रिय रहने पर सो जाता है, इसलिए uptimerobot.com पर एक फ्री HTTP Monitor बनाएं जो हर 5 मिनट में ${appUrl}/health को पिंग करे।`,
        },
      ]
    : [
        {
          title: '1. Create a Free Firebase Project (Spark Plan)',
          body: 'Go to console.firebase.google.com, create a project, enable Firestore Database and Authentication (Google Sign-In). Generate a Service Account JSON key for FIREBASE_SERVICE_ACCOUNT_JSON and deploy firestore.rules.',
        },
        {
          title: '2. Switch Instagram to Professional & Link Facebook Page',
          body: 'In the Instagram app, switch your account to Professional (Business or Creator) and link it to a Facebook Page you admin.',
        },
        {
          title: '3. Create Meta Developer App & Permissions',
          body: 'At developers.facebook.com, create a Business app, add Instagram and Webhooks products, and grant: instagram_basic, instagram_manage_comments, instagram_manage_messages, pages_show_list, pages_manage_metadata, pages_read_engagement, pages_messaging.',
        },
        {
          title: '4. Run in Development Mode Without App Review',
          body: 'Add your Instagram/Facebook accounts under App Roles → Admins/Testers. Automations work immediately on your own assets without Meta App Review.',
        },
        {
          title: '5. Configure Meta Webhooks',
          body: `Set Callback URL to ${appUrl}/webhooks/meta and your Verify Token from Settings. Subscribe to comments, messages, messaging_postbacks, live_comments (Instagram) and feed (Facebook Page).`,
        },
        {
          title: '6. Configure YouTube Data API v3',
          body: `Enable YouTube Data API v3 in Google Cloud Console, create an OAuth Web Client with redirect URI ${appUrl}/auth/youtube/callback. Note: YouTube has no DMs, so ReplyFlow replies publicly on matching comments.`,
        },
        {
          title: '7. Keep Free Tier Awake with UptimeRobot',
          body: `Render free instances sleep after 15 minutes of inactivity and would miss webhooks. Create a free 5-minute HTTP monitor on uptimerobot.com pinging ${appUrl}/health.`,
        },
      ];

  const metaLimits = isHi
    ? [
        'Private Reply विंडो: कमेंट होने के 7 दिनों के अंदर ही Private Reply भेजा जा सकता है।',
        'एक कमेंट पर केवल 1 Private Reply की अनुमति है।',
        'Follow-up DM केवल तभी भेजा जा सकता है जब यूज़र 24 घंटे के Standard Messaging Window में रिप्लाई या बटन टैप करे।',
        'Instagram प्रति घंटे ~200 ऑटोमेटेड DM की सुरक्षित सीमा रखें; तेज़ बर्स्ट भेजने पर अकाउंट पर अस्थायी ब्लॉक लग सकता है।',
        'YouTube API फ्री कोटा 10,000 यूनिट/दिन है (1 कमेंट रिप्लाई = 50 यूनिट्स, लगभग 190 रिप्लाई/दिन)।',
      ]
    : [
        '7-Day Private Reply Window: Meta allows private replies only within 7 days of the comment.',
        'One Private Reply per Comment: You can send only 1 private reply per comment_id.',
        '24-Hour Messaging Window: Further follow-up DMs require the user to reply or tap a postback button first.',
        'Rate Limits: Keep hourly automated DMs under 200/hr and use 3–15s random delays to avoid spam flags.',
        'YouTube Free Quota: 10,000 units/day (1 reply = 50 units, ~190 replies/day). ReplyFlow auto-pauses at 9,500 units.',
      ];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.help.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.help.subtitle}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {isHi ? 'स्टेप-बाय-स्टेप सेटअप गाइड' : 'Step-by-Step Setup Guide'}
        </h2>
        <div className="space-y-3">
          {setupSteps.map((step) => (
            <div
              key={step.title}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {isHi ? 'Meta और YouTube की ज़रूरी पॉलिसी सीमाएं' : 'Important Meta & YouTube Policy Limits'}
        </h2>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
            {metaLimits.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
