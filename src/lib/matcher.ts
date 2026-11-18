import type { AutomationRule, MatchMode, Platform, TargetType } from '../types/index.ts';

/**
 * Normalizes comment or keyword text for matching:
 * - Unicode NFC normalization (essential for Hindi / Devanagari matras)
 * - Lowercases Latin characters
 * - Strips emojis & punctuation while preserving Unicode letters (\p{L}) and numbers (\p{N})
 * - Collapses extra whitespace
 */
export function normalizeText(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFC')
    .toLowerCase()
    // Keep letters (including Devanagari/Hindi), combining marks (\p{M}), numbers, and whitespace
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Collapses repeated trailing characters for Hinglish/slang typos like "linkkkk" -> "link"
 */
export function collapseRepeatedChars(input: string): string {
  return input.replace(/(.)\1{2,}/gu, '$1$1').replace(/([a-z])\1+$/g, '$1');
}

export function matchKeyword(
  rawText: string,
  keywords: string[],
  excludeKeywords: string[],
  mode: MatchMode
): { matched: boolean; matchedKeyword: string; excludedBy?: string; normalizedText: string } {
  const normalizedText = normalizeText(rawText);
  const collapsedText = collapseRepeatedChars(normalizedText);

  // Check exclusions first
  for (const ex of excludeKeywords) {
    const normEx = normalizeText(ex);
    if (normEx && (normalizedText.includes(normEx) || collapsedText.includes(normEx))) {
      return { matched: false, matchedKeyword: '', excludedBy: ex, normalizedText };
    }
  }

  if (mode === 'any_comment') {
    return { matched: normalizedText.length > 0, matchedKeyword: '*', normalizedText };
  }

  for (const kw of keywords) {
    const normKw = normalizeText(kw);
    if (!normKw) continue;
    const collapsedKw = collapseRepeatedChars(normKw);

    if (mode === 'exact') {
      if (normalizedText === normKw || collapsedText === collapsedKw) {
        return { matched: true, matchedKeyword: kw, normalizedText };
      }
    } else if (mode === 'starts_with') {
      if (normalizedText.startsWith(normKw) || collapsedText.startsWith(collapsedKw)) {
        return { matched: true, matchedKeyword: kw, normalizedText };
      }
    } else {
      // 'contains' — also match word boundary or substring safely for Unicode/Hindi
      if (
        normalizedText.includes(normKw) ||
        collapsedText.includes(collapsedKw)
      ) {
        return { matched: true, matchedKeyword: kw, normalizedText };
      }
    }
  }

  return { matched: false, matchedKeyword: '', normalizedText };
}

export function isRuleScheduleActive(rule: AutomationRule, now: Date = new Date()): boolean {
  if (rule.status !== 'active') return false;
  if (rule.scheduleStart) {
    const start = new Date(rule.scheduleStart);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (rule.scheduleEnd) {
    const end = new Date(rule.scheduleEnd);
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return true;
}

export interface SimulationInput {
  platform: Platform;
  targetType: TargetType;
  mediaId?: string;
  commentText: string;
  username: string;
  firstName?: string;
}

export function findMatchingRule(
  rules: AutomationRule[],
  input: SimulationInput,
  now: Date = new Date()
): {
  rule: AutomationRule | null;
  matchedKeyword: string;
  normalizedText: string;
  reason?: string;
} {
  // Prioritize specific_post rules over all_posts rules
  const sorted = [...rules].sort((a, b) => {
    if (a.targetType === 'specific_post' && b.targetType !== 'specific_post') return -1;
    if (a.targetType !== 'specific_post' && b.targetType === 'specific_post') return 1;
    return 0;
  });

  for (const rule of sorted) {
    if (rule.platform !== input.platform) continue;
    if (!isRuleScheduleActive(rule, now)) continue;

    // Target match check
    if (input.targetType === 'dm_keyword') {
      if (rule.targetType !== 'dm_keyword') continue;
    } else if (input.targetType === 'story_reply') {
      if (rule.targetType !== 'story_reply' && rule.targetType !== 'all_posts') continue;
    } else if (input.targetType === 'live_comment') {
      if (rule.targetType !== 'live_comment' && rule.targetType !== 'all_posts') continue;
    } else {
      // Standard post/reel/video comment
      if (rule.targetType === 'specific_post') {
        if (!input.mediaId || rule.targetMediaId !== input.mediaId) continue;
      } else if (rule.targetType !== 'all_posts') {
        continue;
      }
    }

    const res = matchKeyword(input.commentText, rule.keywords || [], rule.excludeKeywords || [], rule.matchMode);
    if (res.matched) {
      return {
        rule,
        matchedKeyword: res.matchedKeyword,
        normalizedText: res.normalizedText,
      };
    }
  }

  return {
    rule: null,
    matchedKeyword: '',
    normalizedText: normalizeText(input.commentText),
    reason: 'no_matching_rule',
  };
}

export function renderTemplate(
  template: string,
  vars: {
    firstName?: string;
    username?: string;
    commentText?: string;
    link?: string;
  }
): string {
  const first = vars.firstName || vars.username || 'there';
  const user = vars.username ? (vars.username.startsWith('@') ? vars.username : `@${vars.username}`) : '@friend';
  return (template || '')
    .replace(/\{first_name\}/gi, first)
    .replace(/\{username\}/gi, user)
    .replace(/\{comment_text\}/gi, vars.commentText || '')
    .replace(/\{link\}/gi, vars.link || '');
}

export function pickRandomVariation(variations: string[], fallback: string): string {
  const clean = (variations || []).map((v) => v.trim()).filter(Boolean);
  if (clean.length === 0) return fallback;
  return clean[Math.floor(Math.random() * clean.length)];
}

export function extractEmailOrPhone(text: string): { email?: string; phone?: string } {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){8,13}\d/);
  return {
    email: emailMatch ? emailMatch[0].toLowerCase() : undefined,
    phone: phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : undefined,
  };
}
