import type { MediaItem } from '../types/index.ts';

const GRAPH_VERSION = 'v21.0';
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

export class MetaApiError extends Error {
  public code?: number;
  public subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.subcode = subcode;
  }
}

async function graphRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = (await res.json()) as {
    error?: { message?: string; code?: number; error_subcode?: number };
  } & T;

  if (!res.ok || data.error) {
    throw new MetaApiError(
      data.error?.message || `Meta Graph API HTTP ${res.status}`,
      data.error?.code,
      data.error?.error_subcode
    );
  }
  return data;
}

export interface SendMessageOptions {
  accountId: string; // IG User ID or FB Page ID
  accessToken: string;
  recipient: { comment_id: string } | { id: string };
  text: string;
  buttonUrl?: string;
  buttonLabel?: string;
  postbackTitle?: string;
  postbackPayload?: string;
  imageUrl?: string;
  useInstagramHost?: boolean;
}

function buildMessagePayload(opts: SendMessageOptions) {
  // Postback button (Two-step or Follow-gate)
  if (opts.postbackTitle && opts.postbackPayload) {
    return {
      recipient: opts.recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: opts.text,
            buttons: [
              {
                type: 'postback',
                title: opts.postbackTitle.slice(0, 20),
                payload: opts.postbackPayload,
              },
            ],
          },
        },
      },
    };
  }

  // Generic template with image + URL button
  if (opts.imageUrl && opts.buttonUrl) {
    return {
      recipient: opts.recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: opts.text.slice(0, 80),
                subtitle: opts.text.length > 80 ? opts.text.slice(80, 160) : undefined,
                image_url: opts.imageUrl,
                buttons: [
                  {
                    type: 'web_url',
                    url: opts.buttonUrl,
                    title: (opts.buttonLabel || 'Open Link').slice(0, 20),
                  },
                ],
              },
            ],
          },
        },
      },
    };
  }

  // Button template with URL button
  if (opts.buttonUrl) {
    return {
      recipient: opts.recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: opts.text,
            buttons: [
              {
                type: 'web_url',
                url: opts.buttonUrl,
                title: (opts.buttonLabel || 'Open Link').slice(0, 20),
              },
            ],
          },
        },
      },
    };
  }

  // Plain text DM
  return {
    recipient: opts.recipient,
    message: {
      text: opts.text,
    },
  };
}

export async function sendMetaMessage(opts: SendMessageOptions): Promise<{ message_id?: string }> {
  const base = opts.useInstagramHost ? IG_GRAPH_BASE : FB_GRAPH_BASE;
  const endpoint = `${base}/${encodeURIComponent(opts.accountId)}/messages`;
  const payload = buildMessagePayload(opts);

  return graphRequest<{ message_id?: string }>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function replyToInstagramComment(params: {
  commentId: string;
  accessToken: string;
  message: string;
}): Promise<{ id?: string }> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.commentId)}/replies`;
  return graphRequest<{ id?: string }>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({ message: params.message }),
  });
}

export async function replyToFacebookComment(params: {
  commentId: string;
  accessToken: string;
  message: string;
}): Promise<{ id?: string }> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.commentId)}/comments`;
  return graphRequest<{ id?: string }>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({ message: params.message }),
  });
}

export async function checkInstagramUserFollow(params: {
  igScopedUserId: string;
  accessToken: string;
}): Promise<{ isFollowing: boolean; username?: string; name?: string }> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.igScopedUserId)}?fields=name,username,is_user_follow_business`;
  const data = await graphRequest<{
    name?: string;
    username?: string;
    is_user_follow_business?: boolean;
  }>(url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  return {
    isFollowing: Boolean(data.is_user_follow_business),
    username: data.username,
    name: data.name,
  };
}

export async function fetchInstagramMedia(params: {
  igUserId: string;
  accessToken: string;
}): Promise<MediaItem[]> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25`;
  const data = await graphRequest<{
    data?: Array<{
      id: string;
      caption?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      permalink?: string;
      timestamp?: string;
    }>;
  }>(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  return (data.data || []).map((item) => ({
    id: item.id,
    platform: 'instagram',
    title: item.caption ? item.caption.slice(0, 90) : `Instagram ${item.media_type || 'Post'}`,
    thumbnailUrl: item.thumbnail_url || item.media_url,
    mediaType: item.media_type,
    permalink: item.permalink,
    timestamp: item.timestamp,
  }));
}

export async function fetchFacebookPagePosts(params: {
  pageId: string;
  accessToken: string;
}): Promise<MediaItem[]> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.pageId)}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=25`;
  const data = await graphRequest<{
    data?: Array<{
      id: string;
      message?: string;
      full_picture?: string;
      permalink_url?: string;
      created_time?: string;
    }>;
  }>(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  return (data.data || []).map((item) => ({
    id: item.id,
    platform: 'facebook',
    title: item.message ? item.message.slice(0, 90) : 'Facebook Page Post',
    thumbnailUrl: item.full_picture,
    mediaType: 'POST',
    permalink: item.permalink_url,
    timestamp: item.created_time,
  }));
}

export async function exchangeForLongLivedMetaToken(params: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const qs = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: params.appId,
    client_secret: params.appSecret,
    fb_exchange_token: params.shortLivedToken,
  });
  const data = await graphRequest<{ access_token: string; expires_in?: number }>(
    `${FB_GRAPH_BASE}/oauth/access_token?${qs.toString()}`
  );
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in || 60 * 24 * 60 * 60, // 60 days default
  };
}

export async function fetchMetaManagedAccounts(userAccessToken: string): Promise<{
  pages: Array<{
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    pagePicture?: string;
    igBusinessAccount?: {
      igId: string;
      username: string;
      name?: string;
      profilePictureUrl?: string;
    };
  }>;
}> {
  const url = `${FB_GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}`;
  const data = await graphRequest<{
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: {
        id: string;
        username?: string;
        name?: string;
        profile_picture_url?: string;
      };
    }>;
  }>(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });

  return {
    pages: (data.data || []).map((p) => ({
      pageId: p.id,
      pageName: p.name,
      pageAccessToken: p.access_token,
      pagePicture: p.picture?.data?.url,
      igBusinessAccount: p.instagram_business_account
        ? {
            igId: p.instagram_business_account.id,
            username: p.instagram_business_account.username || p.name,
            name: p.instagram_business_account.name,
            profilePictureUrl: p.instagram_business_account.profile_picture_url,
          }
        : undefined,
    })),
  };
}

export async function subscribePageWebhook(params: {
  pageId: string;
  pageAccessToken: string;
}): Promise<void> {
  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(params.pageId)}/subscribed_apps`;
  await graphRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.pageAccessToken}`,
    },
    body: JSON.stringify({
      subscribed_fields: ['feed', 'messages', 'messaging_postbacks'],
    }),
  });
}
