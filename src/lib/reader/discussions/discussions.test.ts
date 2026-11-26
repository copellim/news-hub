import { describe, expect, it } from "vitest";

import { countComments } from "@/lib/reader-model";
import firebase from "../__fixtures__/hackernews-firebase.json";
import algoliaStory from "../__fixtures__/hackernews-item.json";
import huggingFace from "../__fixtures__/huggingface-comments.json";
import lobstersStory from "../__fixtures__/lobsters-story.json";
import { hackerNewsDiscussion, type AlgoliaItem } from "./hackernews";
import { huggingFaceDiscussion, type HuggingFaceComment } from "./huggingface";
import { discussionFetcherFor } from "./index";
import { lobstersDiscussion, type LobstersStoryWithComments } from "./lobsters";

// Fixtures trimmed from real responses of 2026-10-23.

describe("hackerNewsDiscussion", () => {
  const story = algoliaStory as AlgoliaItem;

  it("orders the first level like HN, with those missing from Firebase at the bottom", () => {
    const discussion = hackerNewsDiscussion(story, firebase.kids);
    // Algolia gives them in id order: 50195081, 50195217, 50195818, 50195923.
    expect(discussion.comments.map((comment) => comment.id)).toEqual([
      "50195923",
      "50195217",
      "50195818",
      "50195081",
    ]);
  });

  it("without Firebase keeps Algolia's order", () => {
    const discussion = hackerNewsDiscussion(story, []);
    expect(discussion.comments.map((comment) => comment.id)).toEqual([
      "50195081",
      "50195217",
      "50195818",
      "50195923",
    ]);
  });

  it("keeps the tree, decodes entities and does not invent scores", () => {
    const discussion = hackerNewsDiscussion(story, firebase.kids);
    expect(countComments(discussion.comments)).toBe(10);
    const first = discussion.comments.find((comment) => comment.id === "50195081");
    expect(first?.html).toContain("There's a formal press release");
    expect(first?.score).toBeNull();
    expect(discussion.postHtml).toBeNull();
  });

  it("a comment without text counts as deleted and keeps its replies", () => {
    const deleted = {
      ...story,
      children: [{ ...story.children[1], text: null, author: null }],
    };
    const [comment] = hackerNewsDiscussion(deleted, []).comments;
    expect(comment.html).toBeNull();
    expect(comment.replies).toHaveLength(2);
  });
});

describe("lobstersDiscussion", () => {
  const story = lobstersStory as LobstersStoryWithComments;

  it("rebuilds the tree from parent_comment in the site's order", () => {
    const discussion = lobstersDiscussion(story);
    expect(discussion.comments.map((comment) => comment.id)).toEqual([
      "uqh4lj",
      "3sbgqg",
    ]);
    const [first] = discussion.comments;
    expect(first.replies.map((reply) => reply.id)).toEqual([
      "lxxqsn",
      "8jbepi",
      "tehvra",
    ]);
    expect(first.replies[1].replies.map((reply) => reply.id)).toEqual(["il8wbs"]);
    expect(first.score).toBe(33);
    expect(discussion.postHtml).toContain("<p>");
  });

  it("a moderated comment loses text and author but not its replies", () => {
    const moderated = {
      ...story,
      comments: story.comments.map((comment) =>
        comment.short_id === "uqh4lj" ? { ...comment, is_moderated: true } : comment,
      ),
    };
    const [first] = lobstersDiscussion(moderated).comments;
    expect(first.html).toBeNull();
    expect(first.author).toBeNull();
    expect(first.replies).toHaveLength(3);
  });
});

describe("huggingFaceDiscussion", () => {
  it("puts the replies under the comment", () => {
    const discussion = huggingFaceDiscussion(
      "2610.28027",
      huggingFace.comments as HuggingFaceComment[],
    );
    expect(discussion.url).toBe("https://huggingface.co/papers/2610.28027");
    expect(discussion.comments).toHaveLength(2);
    expect(discussion.comments[1].replies).toHaveLength(1);
    expect(discussion.comments[0].author).toBe("Purdy0228");
    expect(discussion.comments[0].html).toMatch(/^<p>/);
  });
});

describe("discussionFetcherFor", () => {
  it("accepts only keys of sources with comments and well-formed ids", () => {
    expect(discussionFetcherFor("hackernews:50195110")).not.toBeNull();
    expect(discussionFetcherFor("lobsters:nmurnh")).not.toBeNull();
    expect(discussionFetcherFor("arxiv:2610.28027")).not.toBeNull();
    expect(discussionFetcherFor("reddit:abc123")).toBeNull();
    expect(discussionFetcherFor("hackernews:1/../../x")).toBeNull();
    expect(discussionFetcherFor("lobsters:abc?x=1")).toBeNull();
  });
});
