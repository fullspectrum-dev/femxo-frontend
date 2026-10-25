import type { ProductSummary } from "../../contracts/catalog";
import type { Facets, SearchQuery, Suggestion } from "../../contracts/search";
import { toProductSummary, type StockLookup } from "./mappers";
import type { Catalog, SeedProduct } from "./types";

/*
 * The mock's stand-in for Atlas Search (backend ADR 0006): word and prefix
 * matching, synonyms, typo tolerance, facets and sorting. It is small and
 * readable on purpose; the real engine replaces it behind SearchApi.
 */

const PRICE_EDGES = [0, 10_000, 25_000, 50_000, 100_000];
/** A product "has a Prime benefit" when it is Prime-only or Prime is at least 5% cheaper. */
const PRIME_BENEFIT = 0.95;
const FIELD_WEIGHT = { name: 3, brand: 2, category: 1.5 } as const;

/** Plural → singular, so "biscuits" and "biscuit" are one word. */
const stem = (word: string) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const tokenize = (text: string) => words(text).map(stem);

/** How many typos a word of this length may have. */
const allowedEdits = (length: number) => (length <= 3 ? 0 : length <= 5 ? 1 : 2);

/** Edit distance where swapping two neighbours counts as one edit ("mustrad" → "mustard"). */
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i]![j] = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1);
    }
  }
  return rows[a.length]![b.length]!;
}

interface Posting {
  doc: number;
  weight: number;
}

export function createSearchIndex(catalog: Catalog, synonyms: Record<string, string[]>) {
  const categoryById = new Map(catalog.categories.map((category) => [category.id, category]));
  const brandById = new Map(catalog.brands.map((brand) => [brand.id, brand]));

  // ---------- Index: word → which products have it, and how much it counts ----------
  const postings = new Map<string, Posting[]>();
  const surface = new Map<string, string>();
  const addTerm = (doc: number, text: string, weight: number) => {
    for (const word of words(text)) {
      const term = stem(word);
      const list = postings.get(term) ?? [];
      const existing = list.find((entry) => entry.doc === doc);
      if (existing) existing.weight = Math.max(existing.weight, weight);
      else list.push({ doc, weight });
      postings.set(term, list);
      if (!surface.has(term)) surface.set(term, word);
    }
  };
  catalog.products.forEach((product, doc) => {
    addTerm(doc, product.name, FIELD_WEIGHT.name);
    addTerm(doc, brandById.get(product.brandId)!.name, FIELD_WEIGHT.brand);
    addTerm(doc, categoryById.get(product.categoryId)!.name, FIELD_WEIGHT.category);
    addTerm(doc, categoryById.get(product.topCategoryId)!.name, FIELD_WEIGHT.category);
  });
  const vocabulary = [...postings.keys()];

  // Synonyms work both ways: "atta" ↔ "aata", "chawal" ↔ "rice".
  const related = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!related.has(a)) related.set(a, new Set());
    related.get(a)!.add(b);
  };
  for (const [key, values] of Object.entries(synonyms)) {
    for (const value of values.filter((entry) => !entry.includes(" "))) {
      link(stem(key), stem(value));
      link(stem(value), stem(key));
    }
  }

  /** Index words a query word can stand for, each with how good the match is. */
  function expand(word: string) {
    const matches = new Map<string, number>();
    const add = (term: string, score: number) => matches.set(term, Math.max(matches.get(term) ?? 0, score));
    if (postings.has(word)) add(word, 1);
    for (const synonym of related.get(word) ?? []) if (postings.has(synonym)) add(synonym, 0.9);
    if (word.length >= 2) for (const term of vocabulary) if (term !== word && term.startsWith(word)) add(term, word.length >= 3 ? 0.8 : 0.6);
    if (matches.size > 0) return { matches, fuzzy: false };

    // Nothing matches as typed: take the closest words, if any are close enough.
    const limit = allowedEdits(word.length);
    let best = Infinity;
    const close: [string, number][] = [];
    if (limit > 0) {
      for (const term of vocabulary) {
        if (Math.abs(term.length - word.length) > limit) continue;
        const distance = editDistance(word, term);
        if (distance <= limit) {
          close.push([term, distance]);
          best = Math.min(best, distance);
        }
      }
    }
    for (const [term, distance] of close) if (distance === best) add(term, 0.5);
    return { matches, fuzzy: true };
  }

  /** Products matching every word of the query, scored; plus the corrected query when a typo was fixed. */
  function match(query: string) {
    const typed = words(query);
    if (typed.length === 0) return { scores: null, corrected: null as string | null };
    let scores: Map<number, number> | undefined;
    let corrected = false;
    const correctedWords: string[] = [];

    for (const raw of typed) {
      const { matches, fuzzy } = expand(stem(raw));
      if (matches.size === 0) return { scores: new Map<number, number>(), corrected: null };
      if (fuzzy) {
        corrected = true;
        // Show the closest dictionary word, preferring the one the most products use.
        const top = [...matches.keys()].sort((a, b) => postings.get(b)!.length - postings.get(a)!.length)[0]!;
        correctedWords.push(surface.get(top)!);
      } else correctedWords.push(raw);

      const wordScores = new Map<number, number>();
      for (const [term, quality] of matches) {
        for (const { doc, weight } of postings.get(term)!) wordScores.set(doc, Math.max(wordScores.get(doc) ?? 0, quality * weight));
      }
      if (scores === undefined) scores = wordScores;
      else {
        // Every word has to match: keep the products in both, adding their scores.
        const both = new Map<number, number>();
        for (const [doc, score] of scores) if (wordScores.has(doc)) both.set(doc, score + wordScores.get(doc)!);
        scores = both;
      }
    }
    return { scores: scores ?? new Map<number, number>(), corrected: corrected ? correctedWords.join(" ") : null };
  }

  const categoryIds = (slug: string | undefined) => {
    if (!slug) return null;
    const category = catalog.categories.find((entry) => entry.slug === slug);
    if (!category) return new Set<string>();
    return new Set(catalog.categories.filter((entry) => entry.id === category.id || entry.parentId === category.id).map((entry) => entry.id));
  };

  type Omit = "brand" | "price" | "rating" | "prime";
  const hasPrimeBenefit = (summary: ProductSummary) => summary.primeExclusive || summary.fromPrimePrice <= summary.fromPrice * PRIME_BENEFIT;

  function search(query: SearchQuery, { stock }: { stock?: StockLookup } = {}) {
    const { scores, corrected } = match(query.q);
    const inCategory = categoryIds(query.category);

    const entries = catalog.products
      .map((product: SeedProduct, doc) => ({ product, doc, summary: toProductSummary(product, catalog, stock), score: scores?.get(doc) ?? 0 }))
      .filter((entry) => (scores ? scores.has(entry.doc) : true) && (inCategory ? inCategory.has(entry.product.categoryId) : true));

    // Facets are counted with every filter except their own, so a brand you've picked still shows the others.
    const passes = (entry: (typeof entries)[number], skip?: Omit) => {
      const { summary } = entry;
      if (skip !== "brand" && query.brand.length > 0 && !query.brand.includes(summary.brand.id)) return false;
      if (skip !== "price" && ((query.minPrice !== undefined && summary.fromPrice < query.minPrice) || (query.maxPrice !== undefined && summary.fromPrice > query.maxPrice))) return false;
      if (skip !== "rating" && query.rating !== undefined && summary.rating < query.rating) return false;
      if (skip !== "prime" && query.prime && !hasPrimeBenefit(summary)) return false;
      return true;
    };

    const results = entries.filter((entry) => passes(entry));
    const byId = (a: (typeof entries)[number], b: (typeof entries)[number]) => (a.product.id < b.product.id ? -1 : 1);
    const order: Record<SearchQuery["sort"], (a: (typeof entries)[number], b: (typeof entries)[number]) => number> = {
      relevance: (a, b) => b.score - a.score || b.summary.rating - a.summary.rating || b.summary.ratingCount - a.summary.ratingCount || byId(a, b),
      price_asc: (a, b) => a.summary.fromPrice - b.summary.fromPrice || byId(a, b),
      price_desc: (a, b) => b.summary.fromPrice - a.summary.fromPrice || byId(a, b),
      rating: (a, b) => b.summary.rating - a.summary.rating || b.summary.ratingCount - a.summary.ratingCount || byId(a, b),
      newest: (a, b) => (a.product.createdAt < b.product.createdAt ? 1 : a.product.createdAt > b.product.createdAt ? -1 : byId(a, b)),
      discount: (a, b) => (b.summary.mrp - b.summary.fromPrice) / b.summary.mrp - (a.summary.mrp - a.summary.fromPrice) / a.summary.mrp || byId(a, b),
    };
    results.sort(order[query.sort]);

    const facets: Facets = { brands: [], priceBuckets: [], ratings: [], primeCount: 0 };
    if (entries.length > 0) {
      const counts = new Map<string, number>();
      for (const entry of entries.filter((candidate) => passes(candidate, "brand"))) counts.set(entry.summary.brand.id, (counts.get(entry.summary.brand.id) ?? 0) + 1);
      facets.brands = [...counts]
        .map(([id, count]) => ({ id, name: brandById.get(id)!.name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      const forPrice = entries.filter((candidate) => passes(candidate, "price"));
      facets.priceBuckets = PRICE_EDGES.map((min, index) => {
        const max = PRICE_EDGES[index + 1] ?? null;
        return { min, max, count: forPrice.filter(({ summary }) => summary.fromPrice >= min && (max === null || summary.fromPrice < max)).length };
      });

      const forRating = entries.filter((candidate) => passes(candidate, "rating"));
      facets.ratings = [4, 3, 2, 1].map((atLeast) => ({ atLeast, count: forRating.filter(({ summary }) => summary.rating >= atLeast).length }));
      facets.primeCount = entries.filter((candidate) => passes(candidate, "prime") && hasPrimeBenefit(candidate.summary)).length;
    }

    return { products: results.map((entry) => entry.summary), total: results.length, facets, correctedQuery: corrected };
  }

  /** The few things worth showing under the search box: categories, a brand, then products. */
  function suggest(text: string, limit = 8, { stock }: { stock?: StockLookup } = {}): Suggestion[] {
    if (words(text).length === 0) return [];
    const { corrected } = match(text);
    const query = words(corrected ?? text).map(stem);
    const startsEvery = (name: string) => {
      const nameWords = tokenize(name);
      return query.every((word) => nameWords.some((candidate) => candidate.startsWith(word)));
    };

    const categories = catalog.categories
      .filter((category) => startsEvery(category.name))
      .slice(0, 2)
      .map((category): Suggestion => ({ kind: "category", label: category.name, href: `/c/${category.slug}` }));
    const brands = catalog.brands
      .filter((brand) => startsEvery(brand.name))
      .slice(0, 1)
      .map((brand): Suggestion => ({ kind: "brand", label: brand.name, href: `/search?brand=${encodeURIComponent(brand.id)}` }));
    const products = search({ q: text, brand: [], sort: "relevance", limit: 24 }, { stock })
      .products.slice(0, limit)
      .map((product): Suggestion => ({ kind: "product", label: product.name, href: `/p/${product.slug}` }));

    return [...categories, ...brands, ...products].slice(0, limit);
  }

  return { search, suggest };
}

export type SearchIndex = ReturnType<typeof createSearchIndex>;
