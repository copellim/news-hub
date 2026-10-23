import "server-only";

import sanitize, { type IOptions } from "sanitize-html";

/**
 * Tag di MathML: le pagine tecniche scrivono così le formule, e i browser le
 * disegnano da soli. `annotation` contiene il sorgente TeX, che resta nascosto.
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
    // `id` tiene vivi i rimandi interni, come le note a piè di pagina.
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
 * L'unico passaggio per l'HTML che arriva da fuori, articoli e commenti: tiene
 * testo, codice, tabelle, figure e formule, toglie script, stili ed eventi.
 *
 * I link relativi diventano assoluti rispetto a `baseUrl`, l'indirizzo finale
 * della pagina: nella card sarebbero relativi a news-hub. linkedom non lo fa
 * da sé (verificato su GitHub: `src="/NVIDIA/OpenShell/raw/..."`).
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
  // I rimandi interni (`#fn:1`) restano nella card.
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
  // `srcset` resta fuori: andrebbe riscritto URL per URL, e `src` basta.
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
