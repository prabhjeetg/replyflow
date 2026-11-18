import type { MediaItem } from '../types/index.ts';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_DAILY_QUOTA_LIMIT = 10000;
export const YOUTUBE_QUOTA_SAFETY_THRESHOLD = 9500;

export class YoutubeApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'YoutubeApiError';
    this.status = status;
  }
}

export async function refreshGoogleOAuthToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new YoutubeApiError(
      data.error_description || data.error || 'Failed to refresh Google OAuth token',
      res.status
    );
  }

  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in || 3600,
  };
}

export async function fetchMyYoutubeChannel(accessToken: string): Promise<{
  channelId: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
}> {
  const res = await fetch(
    `${YT_API_BASE}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        customUrl?: string;
        thumbnails?: { default?: { url?: string } };
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok || !data.items || data.items.length === 0) {
    throw new YoutubeApiError(
      data.error?.message || 'No YouTube channel found for this Google account',
      res.status
    );
  }

  const ch = data.items[0];
  return {
    channelId: ch.id,
    title: ch.snippet.title,
    customUrl: ch.snippet.customUrl,
    thumbnailUrl: ch.snippet.thumbnails?.default?.url,
  };
}

export async function fetchMyYoutubeVideos(params: {
  accessToken: string;
  channelId: string;
}): Promise<{ videos: MediaItem[]; quotaCost: number }> {
  // Using playlistItems on channel's uploads playlist costs only 1 unit instead of 100 units for search!
  const chRes = await fetch(
    `${YT_API_BASE}/channels?part=contentDetails&id=${encodeURIComponent(params.channelId)}`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } }
  );
  const chData = (await chRes.json()) as {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
    error?: { message?: string };
  };
  if (!chRes.ok) {
    throw new YoutubeApiError(chData.error?.message || 'Failed to fetch channel details', chRes.status);
  }

  const uploadsPlaylistId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return { videos: [], quotaCost: 1 };
  }

  const plRes = await fetch(
    `${YT_API_BASE}/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=25`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } }
  );
  const plData = (await plRes.json()) as {
    items?: Array<{
      snippet: {
        title: string;
        publishedAt?: string;
        resourceId?: { videoId?: string };
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }>;
    error?: { message?: string };
  };

  if (!plRes.ok) {
    throw new YoutubeApiError(plData.error?.message || 'Failed to fetch YouTube videos', plRes.status);
  }

  const videos: MediaItem[] = (plData.items || [])
    .filter((i) => i.snippet?.resourceId?.videoId)
    .map((i) => {
      const videoId = i.snippet.resourceId!.videoId!;
      return {
        id: videoId,
        platform: 'youtube',
        title: i.snippet.title,
        thumbnailUrl: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url,
        mediaType: 'VIDEO',
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
        timestamp: i.snippet.publishedAt,
      };
    });

  return { videos, quotaCost: 2 };
}

export interface YoutubeCommentItem {
  commentId: string;
  videoId: string;
  authorDisplayName: string;
  authorChannelId: string;
  textOriginal: string;
  publishedAt: string;
  totalReplyCount: number;
}

export async function pollVideoCommentThreads(params: {
  videoId: string;
  accessToken?: string;
  apiKey?: string;
}): Promise<{ comments: YoutubeCommentItem[]; quotaCost: number }> {
  const url = new URL(`${YT_API_BASE}/commentThreads`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('videoId', params.videoId);
  url.searchParams.set('order', 'time');
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('textFormat', 'plainText');
  if (params.apiKey && !params.accessToken) {
    url.searchParams.set('key', params.apiKey);
  }

  const headers: Record<string, string> = {};
  if (params.accessToken) {
    headers.Authorization = `Bearer ${params.accessToken}`;
  }

  const res = await fetch(url.toString(), { headers });
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        totalReplyCount: number;
        topLevelComment: {
          id: string;
          snippet: {
            videoId: string;
            authorDisplayName: string;
            authorChannelId?: { value?: string };
            textOriginal: string;
            publishedAt: string;
          };
        };
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new YoutubeApiError(data.error?.message || 'Failed to poll YouTube comments', res.status);
  }

  const comments: YoutubeCommentItem[] = (data.items || []).map((item) => {
    const top = item.snippet.topLevelComment;
    return {
      commentId: top.id,
      videoId: top.snippet.videoId || params.videoId,
      authorDisplayName: top.snippet.authorDisplayName,
      authorChannelId: top.snippet.authorChannelId?.value || '',
      textOriginal: top.snippet.textOriginal,
      publishedAt: top.snippet.publishedAt,
      totalReplyCount: item.snippet.totalReplyCount || 0,
    };
  });

  return { comments, quotaCost: 1 };
}

export async function replyToYoutubeComment(params: {
  parentCommentId: string;
  text: string;
  accessToken: string;
}): Promise<{ id: string; quotaCost: number }> {
  const res = await fetch(`${YT_API_BASE}/comments?part=snippet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      snippet: {
        parentId: params.parentCommentId,
        textOriginal: params.text,
      },
    }),
  });

  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new YoutubeApiError(data.error?.message || 'Failed to reply to YouTube comment', res.status);
  }

  return { id: data.id, quotaCost: 50 };
}
