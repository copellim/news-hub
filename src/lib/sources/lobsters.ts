import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";
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

export async function getLobstersItems(): Promise<FeedItem[]> {
  "use cache";
  cacheLife("minutes");

  const stories = await fetchJson<LobstersStory[]>("lobsters", HOTTEST_URL);
  return stories.slice(0, SOURCE_FETCH_LIMIT).map(toFeedItem);
}

function toFeedItem(story: LobstersStory): FeedItem {
  return {
    key: `lobsters:${story.short_id}`,
    source: "lobsters",
    title: story.title,
    // Le "ask"/"show" senza link esterno hanno url vuoto: cade sui commenti.
    url: story.url || story.comments_url,
    discussionUrl: story.comments_url,
    score: story.score,
    commentCount: story.comment_count,
    author: submitterName(story.submitter_user),
    publishedAt: story.created_at,
    tags: story.tags ?? [],
  };
}

/** L'API ha cambiato forma nel tempo: stringa nelle versioni vecchie, oggetto ora. */
function submitterName(submitter: LobstersStory["submitter_user"]): string {
  return typeof submitter === "string" ? submitter : submitter.username;
}
