import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT, USER_AGENT } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import { fetchJson, SourceError } from "./http";

/**
 * Anonymous Reddit is not usable from a server: `www.reddit.com/....json`
 * answers 403 even with a custom user-agent, and the RSS feed switches to 429
 * already on the second request. The only way is a registered app + OAuth
 * client_credentials. Without credentials the lane stays empty instead of
 * failing the page.
 */
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const HOT_URL = `https://oauth.reddit.com/r/programming/hot?limit=${SOURCE_FETCH_LIMIT}&raw_json=1`;

type RedditListing = {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        url: string;
        permalink: string;
        score: number;
        num_comments: number;
        author: string;
        created_utc: number;
        is_self: boolean;
        link_flair_text: string | null;
      };
    }>;
  };
};

export function hasRedditCredentials(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
}

export async function getRedditSnapshot(): Promise<SourceSnapshot> {
  "use cache";
  cacheLife("minutes");

  const fetchedAt = new Date().toISOString();
  if (!hasRedditCredentials()) {
    return { items: [], fetchedAt };
  }

  const token = await requestAccessToken();
  const listing = await fetchJson<RedditListing>("reddit", HOT_URL, {
    authorization: `Bearer ${token}`,
  });

  return {
    items: listing.data.children.map((child) => toFeedItem(child.data)),
    fetchedAt,
  };
}

/**
 * No token cache: this function runs inside `getRedditSnapshot`, already
 * cached for minutes, so it amounts to ~1 request every 5 minutes — below any limit.
 */
async function requestAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new SourceError(
      "reddit",
      `token HTTP ${response.status} — controlla REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET`,
    );
  }

  const { access_token: accessToken } = (await response.json()) as {
    access_token?: string;
  };
  if (!accessToken) {
    throw new SourceError("reddit", "risposta token senza access_token");
  }
  return accessToken;
}

function toFeedItem(post: RedditListing["data"]["children"][number]["data"]): FeedItem {
  const discussionUrl = `https://www.reddit.com${post.permalink}`;
  return {
    key: `reddit:${post.id}`,
    source: "reddit",
    title: post.title,
    // In self-posts `url` already points to the permalink: no external article behind it.
    url: post.is_self ? discussionUrl : post.url,
    discussionUrl,
    score: post.score,
    commentCount: post.num_comments,
    author: post.author,
    publishedAt: new Date(post.created_utc * 1000).toISOString(),
    tags: post.link_flair_text ? [post.link_flair_text] : [],
  };
}
