import { describe, expect, it } from "vitest";
import { latinize, matchesAllTokens, matchScore, normalizeText, queryTokens } from "../shared/textMatch";

describe("normalizeText", () => {
  it("strips Greek accents so accented and unaccented spellings agree", () => {
    expect(normalizeText("Αντρέας")).toBe(normalizeText("Αντρεας"));
    expect(normalizeText("Μπουκόλος")).toBe(normalizeText("ΜΠΟΥΚΟΛΟΣ"));
  });

  it("folds Greek final sigma", () => {
    expect(normalizeText("Μπουκόλος")).toBe(normalizeText("Μπουκόλοσ"));
  });

  it("strips Latin accents and punctuation", () => {
    expect(normalizeText("Müller-Schmidt")).toBe("muller schmidt");
    expect(normalizeText("  A.B.  Ltd. ")).toBe("a b ltd");
  });
});

describe("latinize", () => {
  it("transliterates Greek names to their Latin spelling", () => {
    // Digraphs follow the conventional shipping-name spelling: μπ→b, ου→ou,
    // ντ→d — the way these people are actually written in the directory.
    expect(latinize("Μπουκόλος")).toBe("boukolos");
    expect(latinize("Αντρέας")).toBe("adreas");
    expect(latinize("Θεοδώρου")).toBe("theodorou");
    expect(latinize("Μπουκουβάλα")).toBe("boukouvala");
  });

  it("leaves Latin text unchanged apart from normalisation", () => {
    expect(latinize("Andreas Boukolos")).toBe("andreas boukolos");
  });
});

describe("cross-script search (real directory cases)", () => {
  // These are the exact pairs that failed before: the user types Greek, the
  // record is stored in Latin.
  it("finds Latin-spelled records from Greek input", () => {
    expect(matchesAllTokens("Μπουκουβάλα", ["Prokopis Boukouvalas"])).toBe(true);
    expect(matchesAllTokens("Αντρέας Μπουκόλος", ["Andreas Boukolos"])).toBe(true);
    expect(matchesAllTokens("Κουτσούκου", ["VASILIKI KOUTSOUKOU"])).toBe(true);
    expect(matchesAllTokens("Θεοδώρου", ["Theodorou Petros"])).toBe(true);
  });

  it("finds Greek-spelled records from Latin input", () => {
    expect(matchesAllTokens("boukolos", ["ΑΝΤΡΕΑΣ ΜΠΟΥΚΟΛΟΣ"])).toBe(true);
    expect(matchesAllTokens("papadopoulos", ["ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ"])).toBe(true);
  });

  it("does not match different people", () => {
    expect(matchesAllTokens("Παπαδόπουλος", ["Georgiou Maria"])).toBe(false);
    expect(matchesAllTokens("Μπουκόλος", ["Nikolaou Petros"])).toBe(false);
    expect(matchesAllTokens("Κουκουλάς", ["Koutsoukou Vasiliki"])).toBe(false);
  });
});

describe("queryTokens", () => {
  it("splits into words and drops single-character noise", () => {
    // Final sigma is folded to σ, so tokens always end in the same letter.
    expect(queryTokens("Αντρέας Μπουκόλο")).toEqual(["αντρεασ", "μπουκολο"]);
    expect(queryTokens("a bc")).toEqual(["bc"]);
  });

  it("keeps a lone short word rather than returning nothing", () => {
    expect(queryTokens("ax")).toEqual(["ax"]);
    expect(queryTokens("x")).toEqual(["x"]);
  });
});

describe("matchesAllTokens", () => {
  it("matches regardless of word order", () => {
    expect(matchesAllTokens("Μπουκόλος Αντρέας", ["Αντρέας Μπουκόλος"])).toBe(true);
  });

  it("matches an accented query against an unaccented record", () => {
    expect(matchesAllTokens("Αντρέας Μπουκόλο", ["ΑΝΤΡΕΑΣ ΜΠΟΥΚΟΛΟΣ"])).toBe(true);
  });

  it("matches partial words so a surname stem is enough", () => {
    expect(matchesAllTokens("boukol", ["Andreas Boukolos"])).toBe(true);
  });

  it("requires every word to be present", () => {
    expect(matchesAllTokens("Αντρέας Παπαδόπουλος", ["Αντρέας Μπουκόλος"])).toBe(false);
  });

  it("searches across several fields, e.g. name plus vessel", () => {
    expect(matchesAllTokens("nikos aegean", ["Nikos Pappas", null, "M/V AEGEAN STAR"])).toBe(true);
  });

  it("returns false when there is nothing to search", () => {
    expect(matchesAllTokens("nikos", [null, undefined, ""])).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesAllTokens("", ["anything"])).toBe(true);
  });
});

describe("matchScore", () => {
  it("ranks an exact match above a prefix, and a prefix above a mid-word hit", () => {
    const exact = matchScore("minerva", ["Minerva"]);
    const prefix = matchScore("minerva", ["Minerva Marine Inc"]);
    const mid = matchScore("minerva", ["Old Minerva Holdings"]);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(mid);
  });

  it("gives no score for an empty query", () => {
    expect(matchScore("", ["Minerva"])).toBe(0);
  });
});
