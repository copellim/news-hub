import "server-only";

import type { Comment, Discussion } from "@/lib/reader-model";
import { fetchJson } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";

const LOBSTERS_BASE_URL = "https://lobste.rs/";

export type LobstersComment = {
  short_id: string;
  created_at: string;
  is_deleted: boolean;
  is_moderated: boolean;
  score: number;
  parent_comment: string | null;
  comment: string;
  commenting_user: string | { username: string };
};

export type LobstersStoryWithComments = {
  short_id: string;
  comments_url: string;
  description: string;
  comments: LobstersComment[];
};

/** Una chiamata: la storia arriva con tutti i commenti. */
export async function fetchLobstersDiscussion(id: string): Promise<Discussion> {
  const story = await fetchJson<LobstersStoryWithComments>(
    "lobsters",
    `${LOBSTERS_BASE_URL}s/${id}.json`,
  );
  return lobstersDiscussion(story);
}

/**
 * La lista è piatta ma già nell'ordine del sito, un thread dopo l'altro: basta
 * appendere ogni commento al suo genitore, senza riordinare niente.
 */
export function lobstersDiscussion(story: LobstersStoryWithComments): Discussion {
  const byId = new Map<string, Comment>();
  const roots: Comment[] = [];
  for (const raw of story.comments) {
    const comment = toComment(raw);
    byId.set(raw.short_id, comment);
    const parent = raw.parent_comment ? byId.get(raw.parent_comment) : undefined;
    (parent ? parent.replies : roots).push(comment);
  }
  return {
    source: "lobsters",
    url: story.comments_url,
    postHtml: story.description.trim()
      ? cleanHtml(story.description, LOBSTERS_BASE_URL)
      : null,
    comments: roots,
  };
}

function toComment(raw: LobstersComment): Comment {
  const isGone = raw.is_deleted || raw.is_moderated;
  return {
    id: raw.short_id,
    author: isGone ? null : usernameOf(raw.commenting_user),
    createdAt: raw.created_at,
    html: isGone ? null : cleanHtml(raw.comment, LOBSTERS_BASE_URL),
    score: isGone ? null : raw.score,
    replies: [],
  };
}

/** L'API ha cambiato forma nel tempo: stringa nelle versioni vecchie, oggetto ora. */
function usernameOf(user: LobstersComment["commenting_user"]): string {
  return typeof user === "string" ? user : user.username;
}
