/**
 * Text matching used by every search box in the app.
 *
 * Three problems it solves, all of which come from real data in this directory:
 *  1. Accents. "Αντρέας" typed as "Αντρεας" (or the other way round) must match.
 *     Greek final sigma is folded too, so "Μπουκόλος" matches "μπουκολος".
 *  2. Word order. People type "Μπουκόλος Αντρέας" for a record stored as
 *     "Andreas Boukolos"; every typed word must be found somewhere, in any order.
 *  3. Script. The directory mixes Greek and Latin spellings of the same person,
 *     so Greek input is also transliterated to Latin before comparing.
 *
 * `normalizeText` is the single source of truth: the SQL layer prefilters loosely
 * and this function makes the final decision, so client and server agree.
 */

/**
 * Digraphs first — Greek transliteration is not letter-by-letter. Shipping
 * names in this directory are spelled the conventional way: ου→ou (Μπουκουβάλα
 * → Boukouvalas), μπ→b, ντ→d, γκ→g, αι→ai, ει→ei, οι→oi. Ignoring these makes
 * Greek input unable to find its own Latin record.
 */
const GREEK_DIGRAPHS: [RegExp, string][] = [
  [/ου/g, "ou"],
  [/μπ/g, "b"],
  [/ντ/g, "d"],
  [/γκ/g, "g"],
  [/γγ/g, "ng"],
  [/τσ/g, "ts"],
  [/τζ/g, "tz"],
  [/αι/g, "ai"],
  [/ει/g, "ei"],
  [/οι/g, "oi"],
  [/ευ/g, "ef"],
  [/αυ/g, "af"],
];

/** Single Greek letters to their usual Latin transliteration. */
const GREEK_TO_LATIN: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "i",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

/**
 * Lowercase, strip accents/diacritics and collapse whitespace and punctuation to
 * single spaces. Keeps letters and digits from any script, so Greek stays Greek.
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    // Combining marks: covers Latin accents and Greek tonos/dialytika alike.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    // Keep Latin letters, digits and Greek letters; everything else becomes a
    // separator. Written without the /u flag so it compiles on older targets.
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff]+/g, " ")
    .trim();
}

/**
 * Normalized text with Greek transliterated to Latin: digraphs first, then
 * single letters. Latin input passes through untouched.
 */
export function latinize(value: string | null | undefined): string {
  const base = normalizeText(value);
  if (!base) return "";
  let work = base;
  for (const [re, rep] of GREEK_DIGRAPHS) work = work.replace(re, rep);
  let out = "";
  for (const ch of work) out += GREEK_TO_LATIN[ch] ?? ch;
  return out;
}

/**
 * Collapse spellings that differ only by interchangeable Latin letters, so the
 * same person written "Boukouvalas" / "Voukouvalas" / "Bukuvalas" compares
 * equal. Applied to both sides of a comparison, never shown to the user.
 */
export function loosen(value: string): string {
  return value
    .replace(/ph/g, "f")
    .replace(/kh|ch/g, "h")
    // ντ is written "nd" or "d" (Αντρέας → Andreas / Adreas), likewise μπ→mb/b.
    .replace(/nd/g, "d")
    .replace(/mb/g, "v")
    .replace(/[bv]/g, "v")
    .replace(/ou|oy|u/g, "u")
    .replace(/[yi]/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/**
 * All comparable forms of a string: as-typed (accent-free), transliterated, and
 * loosened. Matching against any of them lets Greek input find Latin records,
 * and tolerates b/v, ou/u and ph/f spelling differences.
 */
export function matchForms(value: string | null | undefined): string[] {
  const plain = normalizeText(value);
  if (!plain) return [];
  const forms = new Set<string>([plain, latinize(value), loosen(latinize(value))]);
  forms.delete("");
  return Array.from(forms);
}

/** Split a query into its distinct words, ignoring 1-character noise. */
export function queryTokens(query: string): string[] {
  const norm = normalizeText(query);
  if (!norm) return [];
  const tokens = norm.split(" ").filter(t => t.length > 1);
  // A single short word (e.g. a vessel called "Ax") is still a valid search.
  return tokens.length > 0 ? tokens : norm.split(" ").filter(Boolean);
}

/**
 * True when every word of the query appears in any of the given fields.
 * Word order does not matter, and Greek/Latin spellings are interchangeable.
 * Matching is substring-based so "boukol" still finds "Boukolos".
 */
export function matchesAllTokens(query: string, fields: (string | null | undefined)[]): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return true;
  const hay: string[] = [];
  for (const f of fields) {
    for (const form of matchForms(f)) hay.push(form);
  }
  if (hay.length === 0) return false;
  return tokens.every(tok => {
    const latinTok = latinize(tok);
    const variants = [tok, latinTok, loosen(latinTok)].filter((v, i, a) => v && a.indexOf(v) === i);
    return hay.some(h => {
      for (const v of variants) if (v && h.includes(v)) return true;
      return false;
    });
  });
}

/**
 * Relevance score for ordering hits: exact match beats prefix, which beats a
 * mid-word hit; matching more fields adds a little. Higher is better.
 */
export function matchScore(query: string, fields: (string | null | undefined)[]): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;
  let score = 0;
  const forms = fields.flatMap(f => matchForms(f));
  const whole = normalizeText(query);
  for (const form of forms) {
    if (!form) continue;
    if (form === whole) score += 100;
    else if (form.startsWith(whole)) score += 60;
    else if (form.includes(whole)) score += 30;
    for (const tok of tokens) {
      const latinTok = latinize(tok);
      if (form.split(" ").some(w => w === tok || w === latinTok)) score += 12;
      else if (form.includes(tok) || form.includes(latinTok)) score += 4;
    }
  }
  return score;
}
