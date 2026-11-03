import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArxivSnapshot, getArxivTexts, parseArxivListing, parseArxivRss } from "./arxiv";
import { fetchArxivText } from "./arxiv-request";
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("./arxiv-request", () => ({ fetchArxivText: vi.fn() }));
const emptyRss = '<rss><channel><title>cs.AI</title></channel></rss>';
function listing(count = 100) {
  return '<div id="dlpage"><dl><h3>Mon, 2 Nov 2026 (showing entries)</h3>' + Array.from({ length: count }, (_, i) => `<dt><a title="Abstract" href="/abs/2611.${String(i + 1).padStart(5, "0")}v1">Paper</a></dt><dd><div class="list-title"><span class="descriptor">Title:</span> Paper ${i + 1} &amp; methods</div><div class="list-authors"><a>Author One</a><a>Author Two</a></div><div class="list-subjects">Artificial Intelligence (cs.AI)</div></dd>`).join('') + '</dl></div>';
}
beforeEach(() => {
  vi.mocked(fetchArxivText).mockReset();
  vi.mocked(fetchArxivText).mockImplementation(async (url) => url.includes('rss.arxiv.org') ? emptyRss : url.includes('/abs/') ? '<meta name="citation_abstract" content="Abstract completo dal paper.">' : listing());
});
describe("recupero arXiv oltre gli annunci del giorno", () => {
  it("recupera almeno 20 candidati reali dal recente quando gli RSS sono vuoti", async () => {
    const snapshot = await getArxivSnapshot(["cs.AI"]);
    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.items[0]).toMatchObject({ key: "arxiv:2611.00001", source: "arxiv", title: "Paper 1 & methods", author: "Author One", publishedAt: "2026-11-02T00:00:00.000Z", score: null, tags: ["cs.AI"] });
    expect(snapshot.notice).toContain("liste recenti");
    expect(fetchArxivText).toHaveBeenCalledWith("https://arxiv.org/list/cs.AI/recent?skip=0&show=100");
  });
  it("tollera un RSS guasto e deduplica i cross-list tra categorie", async () => {
    vi.mocked(fetchArxivText).mockImplementation(async (url) => { if (url.includes('rss.')) throw new Error('HTTP 503'); return listing(); });
    expect((await getArxivSnapshot(["cs.AI", "cs.LG"])).items).toHaveLength(100);
  });
  it("non consulta indirizzi costruiti da categorie non ammesse", async () => {
    expect((await getArxivSnapshot(["../secret"])).items).toEqual([]);
    expect(fetchArxivText).not.toHaveBeenCalled();
  });
  it("scarica l'abstract solo per chiavi richieste e presenti nel pool", async () => {
    const texts = await getArxivTexts(["cs.AI"], ["arxiv:2611.00001", "arxiv:9999.99999"]);
    expect([...texts.keys()]).toEqual(["arxiv:2611.00001"]);
    expect(texts.get("arxiv:2611.00001")?.abstract).toBe("Abstract completo dal paper.");
    expect(fetchArxivText).not.toHaveBeenCalledWith(expect.stringContaining('9999.99999'));
  });
  it("non scambia un errore HTML per una lista vuota valida", () => {
    expect(() => parseArxivListing('<html>Service unavailable</html>')).toThrow();
    expect(parseArxivRss(emptyRss)).toEqual([]);
  });
  it("normalizza versioni e conserva abstract dagli RSS", () => {
    const xml = '<rss><channel><item><title>Paper</title><link>https://arxiv.org/abs/2611.00001v2</link><description>Announce Type: new Abstract: Evidence.</description><category>cs.AI</category><pubDate>Tue, 3 Nov 2026 00:00:00 GMT</pubDate></item></channel></rss>';
    expect(parseArxivRss(xml)[0]).toMatchObject({ item: { key: 'arxiv:2611.00001' }, abstract: 'Evidence.' });
  });
  it("integra dai mesi precedenti quando recent contiene pochi paper", async () => {
    vi.mocked(fetchArxivText).mockImplementation(async (url) => url.includes('rss.') ? emptyRss : url.includes('/recent?') ? listing(10) : listing(100));
    expect((await getArxivSnapshot(["stat.OT"])).items).toHaveLength(100);
    expect(fetchArxivText).toHaveBeenCalledWith(expect.stringMatching(/\/\d{4}\?skip=0&show=100$/));
  });
  it("una categoria guasta non elimina i paper delle altre categorie", async () => {
    vi.mocked(fetchArxivText).mockImplementation(async (url) => { if (url.includes('cs.AI')) throw new Error('HTTP 503'); return url.includes('rss.') ? emptyRss : listing(); });
    const snapshot = await getArxivSnapshot(["cs.AI", "cs.LG"]);
    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.notice).toContain('cs.AI non disponibile');
  });
});
