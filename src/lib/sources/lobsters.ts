import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import { fetchJson } from "./http";

const HOTTEST_URL = "https://lobste.rs/hottest.json";

type LobstersStory = {
  short_id: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  created_at: string;
  comments_url: string;
  submitter_user: string | { username: string };
  tags: string[];
};

export async function getLobstersSnapshot(): Promise<SourceSnapshot> {
  "use cache";
  cacheLife("minutes");

  const stories = await fetchJson<LobstersStory[]>("lobsters", HOTTEST_URL);
  return {
    items: stories.slice(0, SOURCE_FETCH_LIMIT).map(toFeedItem),
    fetchedAt: new Date().toISOString(),
  };
}

function toFeedItem(story: LobstersStory): FeedItem {
  return {
    key: `lobsters:${story.short_id}`,
    source: "lobsters",
    title: story.title,
    // "ask"/"show" posts without an external link have an empty url: fall back to the comments.
    url: story.url || story.comments_url,
    discussionUrl: story.comments_url,
    score: story.score,
    commentCount: story.comment_count,
    author: submitterName(story.submitter_user),
    publishedAt: story.created_at,
    tags: story.tags ?? [],
  };
}

/** The API has changed shape over time: a string in old versions, an object now. */
function submitterName(submitter: LobstersStory["submitter_user"]): string {
  return typeof submitter === "string" ? submitter : submitter.username;
}
