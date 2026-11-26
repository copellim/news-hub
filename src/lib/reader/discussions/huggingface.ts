import "server-only";

import type { Comment, Discussion } from "@/lib/reader-model";
import { fetchJson } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";

const HF_BASE_URL = "https://huggingface.co/";

export type HuggingFaceComment = {
  id: string;
  createdAt: string;
  author?: { name?: string } | null;
  data: { hidden?: boolean; latest?: { html?: string } };
  /** A single level: replies do not have replies of their own. */
  replies?: HuggingFaceComment[];
};

/**
 * `field=comments` is documented in HF's OpenAPI spec
 * (`/.well-known/openapi.json`) and accepts a single value per request.
 */
export async function fetchHuggingFaceDiscussion(id: string): Promise<Discussion> {
  const paper = await fetchJson<{ comments?: HuggingFaceComment[] }>(
    "huggingface",
    `${HF_BASE_URL}api/papers/${id}?field=comments`,
  );
  return huggingFaceDiscussion(id, paper.comments ?? []);
}

export function huggingFaceDiscussion(
  id: string,
  comments: readonly HuggingFaceComment[],
): Discussion {
  return {
    source: "huggingface",
    url: `${HF_BASE_URL}papers/${id}`,
    postHtml: null,
    comments: comments.map(toComment),
  };
}

function toComment(raw: HuggingFaceComment): Comment {
  const html = raw.data.hidden ? null : raw.data.latest?.html;
  return {
    id: raw.id,
    author: raw.data.hidden ? null : (raw.author?.name ?? null),
    createdAt: raw.createdAt,
    html: html ? cleanHtml(html, HF_BASE_URL) : null,
    score: null,
    replies: (raw.replies ?? []).map(toComment),
  };
}
