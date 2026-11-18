export type Platform = 'instagram' | 'facebook' | 'youtube';
export type Language = 'en' | 'hi';
export type ThemeMode = 'light' | 'dark';

export type RuleStatus = 'active' | 'paused';
export type TargetType = 'all_posts' | 'specific_post' | 'dm_keyword' | 'story_reply' | 'live_comment';
export type MatchMode = 'contains' | 'exact' | 'starts_with' | 'any_comment';
export type DmFlowType = 'simple' | 'two_step' | 'follow_gate';

export type DmDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'skipped'
  | 'awaiting_postback'
  | 'awaiting_follow'
  | 'public_only';

export type PublicReplyStatus = 'sent' | 'failed' | 'disabled' | 'fallback_sent' | 'pending';

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  language: Language;
  theme?: ThemeMode;
  pauseAllAutomations: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  platform: Platform;
  platformAccountId: string;
  pageId?: string;
  username: string;
  displayName?: string;
  profilePictureUrl?: string;
  status: 'connected' | 'expired' | 'error';
  lastError?: string;
  tokenExpiresAt?: string;
  lastRefreshedAt?: string;
  youtubeQuotaUsedToday?: number;
  youtubeQuotaResetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  id: string;
  platform: Platform;
  title: string;
  thumbnailUrl?: string;
  mediaType?: string;
  permalink?: string;
  timestamp?: string;
}

export interface AutomationRule {
  id: string;
  userId: string;
  accountId: string;
  platform: Platform;
  name: string;
  status: RuleStatus;
  targetType: TargetType;
  targetMediaId?: string;
  targetMediaTitle?: string;
  targetMediaThumbnail?: string;
  keywords: string[];
  matchMode: MatchMode;
  excludeKeywords: string[];
  dmFlow: DmFlowType;
  dmVariations: string[];
  step1Message?: string;
  step1ButtonText?: string;
  followGateMessage?: string;
  followGateButtonText?: string;
  followGateRetryMessage?: string;
  linkUrl: string;
  buttonLabel?: string;
  imageUrl?: string;
  publicReplyEnabled: boolean;
  publicReplyVariations: string[];
  fallbackPublicReply?: string;
  leadCaptureEnabled: boolean;
  leadCapturePrompt?: string;
  oneDmPerUser: boolean;
  cooldownHours: number;
  dailyCap: number;
  dailySentCount?: number;
  dailySentDate?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  triggerCount?: number;
  dmSentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: string;
  userId: string;
  ruleId: string;
  ruleName: string;
  accountId: string;
  platform: Platform;
  targetMediaId?: string;
  commentId: string;
  commenterId: string;
  commenterUsername: string;
  commentText: string;
  keywordMatched: string;
  dmStatus: DmDeliveryStatus;
  publicReplyStatus: PublicReplyStatus;
  errorMessage?: string;
  errorCode?: string;
  attempts?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Contact {
  id: string;
  userId: string;
  platform: Platform;
  platformUserId: string;
  username: string;
  firstName?: string;
  blocked: boolean;
  optedOut: boolean;
  optedOutAt?: string;
  totalInteractions: number;
  lastInteractedAt: string;
  lastRuleId?: string;
  lastDmSentAt?: string;
  followGateAttempts?: number;
  awaitingLeadForRuleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  userId: string;
  ruleId: string;
  ruleName: string;
  accountId: string;
  platform: Platform;
  contactId: string;
  username: string;
  email?: string;
  phone?: string;
  rawReply?: string;
  createdAt: string;
}

export interface DailyStat {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  commentsReceived: number;
  dmsSent: number;
  dmsDelivered: number;
  dmsFailed: number;
  buttonClicks: number;
  linkClicks: number;
  followGateConversions: number;
  leadsCaptured: number;
  youtubeReplies: number;
  youtubeQuotaUsed: number;
  updatedAt: string;
}

export interface UserSettings {
  userId: string;
  metaAppId: string;
  hasMetaAppSecret: boolean;
  metaVerifyToken: string;
  youtubeClientId: string;
  hasYoutubeClientSecret: boolean;
  hasYoutubeApiKey: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  hourlyDmLimit: number;
  timezone: string;
  language: Language;
  notificationEmail: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'token_expiring' | 'high_failure_rate' | 'quota_warning';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
