import { describe, expect, it } from "vitest";
import {
  buildMentionToken,
  findActiveMentionQuery,
  parseMentions,
  splitMentionSegments,
  stripMentionMarkup,
} from "./mentions";

describe("@mention markup", () => {
  it("builds a marker that keeps the name readable and the id machine-readable", () => {
    expect(buildMentionToken({ id: 7, name: "Maria Kosta" })).toBe("@[Maria Kosta](7)");
  });

  it("drops characters that would break the marker", () => {
    expect(buildMentionToken({ id: 3, name: "Nick (Sales) [AR]" })).toBe("@[Nick Sales AR](3)");
  });

  it("extracts every mentioned member id once, in order", () => {
    const note = "Informed @[Maria Kosta](7) and @[Nick P](3); @[Maria Kosta](7) will reply";
    expect(parseMentions(note)).toEqual([
      { memberId: 7, name: "Maria Kosta" },
      { memberId: 3, name: "Nick P" },
    ]);
  });

  it("ignores plain @text that is not a real mention", () => {
    expect(parseMentions("emailed them at @accounting about the invoice")).toEqual([]);
  });

  it("renders the note back to something a human reads", () => {
    expect(stripMentionMarkup("Told @[Maria Kosta](7) about inv 12345")).toBe("Told @Maria Kosta about inv 12345");
  });

  it("splits into text and mention segments for highlighting", () => {
    const segments = splitMentionSegments("Told @[Maria Kosta](7) today");
    expect(segments).toEqual([
      { type: "text", value: "Told " },
      { type: "mention", value: "@Maria Kosta", memberId: 7 },
      { type: "text", value: " today" },
    ]);
  });

  it("opens the picker only for an @ that starts a word", () => {
    expect(findActiveMentionQuery("Told @mar", 9)).toEqual({ start: 5, query: "mar" });
    expect(findActiveMentionQuery("email@example.com", 17)).toBeNull();
  });

  it("closes the picker once the mention is complete or the line breaks", () => {
    const done = "Told @[Maria Kosta](7) ";
    expect(findActiveMentionQuery(done, done.length)).toBeNull();
    expect(findActiveMentionQuery("Told @maria\nnext line", 21)).toBeNull();
  });

  it("treats an empty query as 'show the whole team'", () => {
    expect(findActiveMentionQuery("Note: @", 7)).toEqual({ start: 6, query: "" });
  });
});
