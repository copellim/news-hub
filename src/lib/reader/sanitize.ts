import "server-only";

import sanitize, { type IOptions } from "sanitize-html";

/**
 * MathML tags: technical pages write formulas this way, and browsers render
 * them on their own. `annotation` contains the TeX source, which stays hidden.
 */
const MATHML_TAGS = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "mspace",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "merror",
];

const OPTIONS: IOptions = {
  allowedTags: [
    ...sanitize.defaults.allowedTags,
    "img",
    "figure",
    "figcaption",
    "details",
    "summary",
    "del",
    "ins",
    ...MATHML_TAGS,
  ],
  allowedAttributes: {
    // `id` keeps internal references alive, such as footnotes.
    "*": ["id"],
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading", "referrerpolicy"],
    ol: ["start", "reversed"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    time: ["datetime"],
    math: ["display"],
    mi: ["mathvariant"],
    mo: ["stretchy", "fence", "separator", "lspace", "rspace", "largeop", "movablelimits"],
    mfrac: ["linethickness"],
    mspace: ["width"],
    mtd: ["columnalign", "columnspan", "rowspan"],
    mstyle: ["displaystyle", "scriptlevel"],
    annotation: ["encoding"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
};

/**
 * The only pass for HTML coming from outside, articles and comments: it keeps
 * text, code, tables, figures and formulas, and removes scripts, styles and events.
 *
 * Relative links become absolute against `baseUrl`, the page's final
 * address: in the card they would be relative to news-hub. linkedom does not do
 * it by itself (verified on GitHub: `src="/NVIDIA/OpenShell/raw/..."`).
 */
export function cleanHtml(html: string, baseUrl: string): string {
  return sanitize(html, {
    ...OPTIONS,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: linkAttributes(attribs, baseUrl),
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: imageAttributes(attribs, baseUrl),
      }),
    },
  });
}

function linkAttributes(
  attribs: sanitize.Attributes,
  baseUrl: string,
): sanitize.Attributes {
  const { href, title } = attribs;
  // Internal references (`#fn:1`) stay in the card.
  if (href?.startsWith("#")) {
    return { href, ...(title ? { title } : {}) };
  }
  const absolute = absoluteUrl(href, baseUrl);
  return {
    ...(absolute ? { href: absolute } : {}),
    ...(title ? { title } : {}),
    target: "_blank",
    rel: "noopener noreferrer",
  };
}

function imageAttributes(
  attribs: sanitize.Attributes,
  baseUrl: string,
): sanitize.Attributes {
  const { src, alt, title, width, height } = attribs;
  const absolute = src?.startsWith("data:") ? src : absoluteUrl(src, baseUrl);
  // `srcset` stays out: it would have to be rewritten URL by URL, and `src` is enough.
  return {
    ...definedOnly({ alt, title, width, height }),
    ...(absolute ? { src: absolute } : {}),
    loading: "lazy",
    referrerpolicy: "no-referrer",
  };
}

function definedOnly(
  attribs: Record<string, string | undefined>,
): sanitize.Attributes {
  return Object.fromEntries(
    Object.entries(attribs).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}
