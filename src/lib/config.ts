/**
 * Hardcoded arXiv filter (option "a"): the category feeds carry ~350 items a
 * day each, unreadable without a selection. It is changed here, there is no UI
 * or per-user state — it is the choice that keeps the project fully static.
 */

/**
 * arXiv taxonomy for the archives this aggregator is interested in:
 * Computer Science, Statistics and Electrical Engineering (50 categories,
 * from <https://arxiv.org/category_taxonomy>). Adding math/physics means
 * adding rows here, nothing else.
 *
 * It is also the whitelist: the category comes from the client and ends up in a URL
 * (`https://rss.arxiv.org/rss/<id>`), so no id outside this list
 * can be requested.
 */
export const ARXIV_CATEGORY_CATALOG: readonly {
  id: string;
  label: string;
  archive: string;
}[] = [
  // Computer Science
  { id: "cs.AI", label: "Artificial Intelligence", archive: "Computer Science" },
  { id: "cs.AR", label: "Hardware Architecture", archive: "Computer Science" },
  { id: "cs.CC", label: "Computational Complexity", archive: "Computer Science" },
  { id: "cs.CE", label: "Computational Engineering, Finance, and Science", archive: "Computer Science" },
  { id: "cs.CG", label: "Computational Geometry", archive: "Computer Science" },
  { id: "cs.CL", label: "Computation and Language", archive: "Computer Science" },
  { id: "cs.CR", label: "Cryptography and Security", archive: "Computer Science" },
  { id: "cs.CV", label: "Computer Vision and Pattern Recognition", archive: "Computer Science" },
  { id: "cs.CY", label: "Computers and Society", archive: "Computer Science" },
  { id: "cs.DB", label: "Databases", archive: "Computer Science" },
  { id: "cs.DC", label: "Distributed, Parallel, and Cluster Computing", archive: "Computer Science" },
  { id: "cs.DL", label: "Digital Libraries", archive: "Computer Science" },
  { id: "cs.DM", label: "Discrete Mathematics", archive: "Computer Science" },
  { id: "cs.DS", label: "Data Structures and Algorithms", archive: "Computer Science" },
  { id: "cs.ET", label: "Emerging Technologies", archive: "Computer Science" },
  { id: "cs.FL", label: "Formal Languages and Automata Theory", archive: "Computer Science" },
  { id: "cs.GL", label: "General Literature", archive: "Computer Science" },
  { id: "cs.GR", label: "Graphics", archive: "Computer Science" },
  { id: "cs.GT", label: "Computer Science and Game Theory", archive: "Computer Science" },
  { id: "cs.HC", label: "Human-Computer Interaction", archive: "Computer Science" },
  { id: "cs.IR", label: "Information Retrieval", archive: "Computer Science" },
  { id: "cs.IT", label: "Information Theory", archive: "Computer Science" },
  { id: "cs.LG", label: "Machine Learning", archive: "Computer Science" },
  { id: "cs.LO", label: "Logic in Computer Science", archive: "Computer Science" },
  { id: "cs.MA", label: "Multiagent Systems", archive: "Computer Science" },
  { id: "cs.MM", label: "Multimedia", archive: "Computer Science" },
  { id: "cs.MS", label: "Mathematical Software", archive: "Computer Science" },
  { id: "cs.NA", label: "Numerical Analysis", archive: "Computer Science" },
  { id: "cs.NE", label: "Neural and Evolutionary Computing", archive: "Computer Science" },
  { id: "cs.NI", label: "Networking and Internet Architecture", archive: "Computer Science" },
  { id: "cs.OH", label: "Other Computer Science", archive: "Computer Science" },
  { id: "cs.OS", label: "Operating Systems", archive: "Computer Science" },
  { id: "cs.PF", label: "Performance", archive: "Computer Science" },
  { id: "cs.PL", label: "Programming Languages", archive: "Computer Science" },
  { id: "cs.RO", label: "Robotics", archive: "Computer Science" },
  { id: "cs.SC", label: "Symbolic Computation", archive: "Computer Science" },
  { id: "cs.SD", label: "Sound", archive: "Computer Science" },
  { id: "cs.SE", label: "Software Engineering", archive: "Computer Science" },
  { id: "cs.SI", label: "Social and Information Networks", archive: "Computer Science" },
  { id: "cs.SY", label: "Systems and Control", archive: "Computer Science" },
  // Statistics
  { id: "stat.AP", label: "Applications", archive: "Statistics" },
  { id: "stat.CO", label: "Computation", archive: "Statistics" },
  { id: "stat.ME", label: "Methodology", archive: "Statistics" },
  { id: "stat.ML", label: "Machine Learning", archive: "Statistics" },
  { id: "stat.OT", label: "Other Statistics", archive: "Statistics" },
  { id: "stat.TH", label: "Statistics Theory", archive: "Statistics" },
  // Electrical Engineering and Systems Science
  { id: "eess.AS", label: "Audio and Speech Processing", archive: "Electrical Engineering and Systems Science" },
  { id: "eess.IV", label: "Image and Video Processing", archive: "Electrical Engineering and Systems Science" },
  { id: "eess.SP", label: "Signal Processing", archive: "Electrical Engineering and Systems Science" },
  { id: "eess.SY", label: "Systems and Control", archive: "Electrical Engineering and Systems Science" },
];

/** The categories where AI research comes out: the starting point on first launch. */
export const DEFAULT_ARXIV_CATEGORIES: readonly string[] = [
  "cs.AI",
  "cs.LG",
  "cs.CL",
];

export function isKnownArxivCategory(id: string): boolean {
  return ARXIV_CATEGORY_CATALOG.some((category) => category.id === id);
}


/**
 * Final quota per source after deduplication. The selection on the page
 * cuts this list without repeating requests. arXiv first retrieves a larger
 * margin (ARXIV_CANDIDATE_LIMIT), to keep its quota after the HF duplicates.
 */
export const SOURCE_FETCH_LIMIT = 50;

/** Minimum distinct candidates to retrieve for each paper channel, if available. */
export const MIN_PAPERS_PER_SOURCE = 20;

/** Margin to keep the arXiv quota even when 50 candidates coincide with HF. */
export const ARXIV_CANDIDATE_LIMIT = SOURCE_FETCH_LIMIT * 2;

/** Choices of the selector on the page. They must stay <= SOURCE_FETCH_LIMIT. */
export const ITEMS_PER_SOURCE_OPTIONS = [10, 20, 30, 50] as const;

export const DEFAULT_ITEMS_PER_SOURCE = 20;
export const DEFAULT_PAPERS_PER_SOURCE = 10;

/**
 * arXiv asks clients to identify themselves; Reddit and Lobsters respond worse to
 * anonymous UAs. Reddit recommends the format `platform:app:version (by /u/user)`:
 * add your username when you register the app.
 */
export const USER_AGENT = "web:news-hub:0.1 (personal reader)";
