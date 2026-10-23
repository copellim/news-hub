import { describe, expect, it } from "vitest";

import { arxivIdOf, paperFromAbstractPage } from "./extractors/arxiv";
import { articleFromHtml } from "./extractors/generic";
import { cleanHtml } from "./sanitize";

const LONG_PARAGRAPH = "Testo di prova di un articolo vero. ".repeat(30);

describe("cleanHtml", () => {
  it("toglie script, stili ed eventi", () => {
    const html = cleanHtml(
      '<p style="color:red" onclick="alert(1)">ciao</p><script>alert(1)</script>',
      "https://example.com/",
    );
    expect(html).toBe("<p>ciao</p>");
  });

  it("rende assoluti link e immagini e li apre fuori dalla card", () => {
    const html = cleanHtml(
      '<a href="/doc">doc</a><img src="img/a.png" srcset="b.png 2x" alt="a">',
      "https://github.com/NVIDIA/OpenShell",
    );
    expect(html).toContain('href="https://github.com/doc"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('src="https://github.com/NVIDIA/img/a.png"');
    expect(html).not.toContain("srcset");
    expect(html).toContain('loading="lazy"');
  });

  it("lascia i rimandi interni nella card", () => {
    const html = cleanHtml('<a href="#fn:1">1</a>', "https://example.com/post");
    expect(html).toBe('<a href="#fn:1">1</a>');
  });

  it("scarta gli href javascript:", () => {
    const html = cleanHtml('<a href="javascript:alert(1)">x</a>', "https://example.com/");
    expect(html).not.toContain("javascript");
  });

  it("conserva il MathML", () => {
    const html = cleanHtml(
      '<math display="inline"><mi>x</mi><mo>=</mo><mn>1</mn></math>',
      "https://arxiv.org/html/1",
    );
    expect(html).toBe('<math display="inline"><mi>x</mi><mo>=</mo><mn>1</mn></math>');
  });
});

describe("articleFromHtml", () => {
  it("estrae l'articolo con titolo e testo ripulito", () => {
    const article = articleFromHtml(
      `<html><head><title>Un titolo</title></head><body><nav>menu</nav>
       <article><h1>Un titolo</h1><p>${LONG_PARAGRAPH}</p><p>${LONG_PARAGRAPH}</p>
       <pre><code>let x = 1;</code></pre></article></body></html>`,
      "https://example.com/post",
      "https://example.com/post",
    );
    expect(article.status).toBe("ready");
    if (article.status === "ready") {
      expect(article.title).toBe("Un titolo");
      expect(article.html).toContain("<pre><code>let x = 1;</code></pre>");
      expect(article.extractor).toBe("generic");
    }
  });

  it("una pagina-app ricade su 'non leggibile' con la descrizione og", () => {
    const article = articleFromHtml(
      `<html><head><meta property="og:description" content="Un'app per i colori">
       </head><body><div id="root"></div></body></html>`,
      "https://names.color.pizza/",
      "https://names.color.pizza/",
    );
    expect(article).toMatchObject({
      status: "unavailable",
      excerpt: "Un'app per i colori",
    });
  });
});

describe("arXiv", () => {
  it("riconosce abs, html e pdf, con o senza versione", () => {
    expect(arxivIdOf(new URL("https://arxiv.org/abs/2610.28027"))).toBe("2610.28027");
    expect(arxivIdOf(new URL("https://arxiv.org/html/2410.23726v2"))).toBe("2410.23726v2");
    expect(arxivIdOf(new URL("https://arxiv.org/pdf/hep-th/9901001"))).toBe("hep-th/9901001");
    expect(arxivIdOf(new URL("https://example.com/abs/2610.28027"))).toBeNull();
  });

  const abstractPage = (downloads: string) =>
    `<html><body><h1 class="title"><span class="descriptor">Title:</span>Un paper</h1>
     <div class="authors"><span class="descriptor">Authors:</span><a>Ada Lovelace</a></div>
     <blockquote class="abstract"><span class="descriptor">Abstract:</span>Il riassunto.</blockquote>
     <a href="/pdf/2610.30926" class="abs-button download-pdf">View PDF</a>${downloads}
     </body></html>`;

  it("dalla pagina abs prende solo l'abstract, e rimanda all'HTML quando c'è", () => {
    const article = paperFromAbstractPage(
      abstractPage(
        '<a href="https://arxiv.org/html/2610.30926v1" class="abs-button" id="latexml-download-link">HTML</a>',
      ),
      "https://arxiv.org/abs/2610.30926",
      "2610.30926",
    );
    expect(article).toMatchObject({
      status: "ready",
      title: "Un paper",
      byline: "Ada Lovelace",
      html: "<p>Il riassunto.</p>",
      paper: {
        key: "arxiv:2610.30926",
        fullTextUrl: "https://arxiv.org/html/2610.30926v1",
        fullTextFormat: "html",
      },
    });
  });

  it("senza la versione HTML rimanda al PDF", () => {
    const article = paperFromAbstractPage(
      abstractPage(""),
      "https://arxiv.org/abs/2303.03538v2",
      "2303.03538v2",
    );
    expect(article).toMatchObject({
      paper: {
        // La chiave è quella dei feed, senza versione.
        key: "arxiv:2303.03538",
        fullTextUrl: "https://arxiv.org/pdf/2303.03538v2",
        fullTextFormat: "pdf",
      },
    });
  });
});
