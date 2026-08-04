/**
 * @mentions of internal team members inside free-text notes.
 *
 * A note is stored exactly as the collector typed it, plus a machine-readable
 * marker so the reference survives a rename of the person: the visible text keeps
 * the readable name, and the id travels in the marker.
 *
 *   "Informed @[Maria Kosta](7) about invoice 12345"
 *
 * Rendering strips the marker back to "@Maria Kosta"; the id is what we store in
 * `note_mentions` so a member can later list everything that mentions them.
 * Mentions are references, never assignments — they must not create tasks.
 */

/** `@[Display Name](12)` — the on-disk form. */
const MENTION_PATTERN = "@\\[([^\\]\\n]{1,120})\\]\\((\\d{1,10})\\)";
/** Fresh regex per call: a shared /g regex would carry lastIndex between calls. */
const mentionRe = () => new RegExp(MENTION_PATTERN, "g");

export interface ParsedMention {
  memberId: number;
  name: string;
}

/** Every mention in a note, de-duplicated by member id, in order of appearance. */
export function parseMentions(text: string | null | undefined): ParsedMention[] {
  if (!text) return [];
  const out: ParsedMention[] = [];
  const seen = new Set<number>();
  const re = mentionRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const memberId = Number(m[2]);
    if (!Number.isFinite(memberId) || memberId <= 0 || seen.has(memberId)) continue;
    seen.add(memberId);
    out.push({ memberId, name: m[1].trim() });
  }
  return out;
}

/** Human-readable note: markers collapse to "@Name". Used for exports, emails, search. */
export function stripMentionMarkup(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(mentionRe(), (_all, name) => `@${String(name).trim()}`);
}

/** The marker to insert when a name is picked from the @ list. */
export function buildMentionToken(member: { id: number; name: string }): string {
  // Brackets/parens inside a name would break the marker, so they are dropped.
  const safe = member.name.replace(/[\[\]()\n]/g, " ").replace(/\s+/g, " ").trim();
  return `@[${safe}](${member.id})`;
}

export interface MentionSegment {
  type: "text" | "mention";
  value: string;
  memberId?: number;
}

/**
 * Split a note into plain-text and mention segments so the UI can highlight the
 * names without resorting to dangerouslySetInnerHTML.
 */
export function splitMentionSegments(text: string | null | undefined): MentionSegment[] {
  if (!text) return [];
  const segments: MentionSegment[] = [];
  let last = 0;
  const re = mentionRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });
    segments.push({ type: "mention", value: `@${m[1].trim()}`, memberId: Number(m[2]) });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

/**
 * Locate an in-progress `@query` immediately before the caret, so the picker only
 * opens while the user is actually typing a name (not for every stray "@").
 */
export function findActiveMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  // Must start a word: beginning of text or preceded by whitespace.
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  // A completed marker or a line break ends the search; keep the query short.
  if (/[\n\]\[()]/.test(query) || query.length > 40) return null;
  return { start: at, query };
}
