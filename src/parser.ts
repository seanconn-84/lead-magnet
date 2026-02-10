/**
 * Telegram username parser — extracts and normalizes usernames from various formats.
 *
 * Supported input formats:
 *   @username
 *   username (bare, validated against Telegram rules)
 *   https://t.me/username
 *   http://t.me/username
 *   t.me/username
 *   https://telegram.me/username
 */

/** Telegram username rules: 5-32 chars, alphanumeric + underscores, cannot start/end with underscore */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9]$/;

/** Matches @username mentions in text */
const MENTION_REGEX = /@([a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9])/g;

/** Matches t.me or telegram.me links in text */
const LINK_REGEX =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9])/g;

/** Reserved Telegram paths that are not usernames */
const RESERVED_PATHS = new Set([
  "joinchat",
  "addstickers",
  "addemoji",
  "share",
  "proxy",
  "socks",
  "setlanguage",
  "addtheme",
  "confirmphone",
  "login",
  "iv",
  "s",
]);

export interface ParsedUsername {
  /** The raw input that was matched */
  raw: string;
  /** The normalized username (lowercase, no @ prefix) */
  username: string;
  /** How the username was detected */
  source: "mention" | "link" | "bare";
}

/**
 * Checks whether a string is a valid Telegram username format.
 * Does NOT check if the user actually exists — use the validator for that.
 */
export function isValidUsernameFormat(username: string): boolean {
  const bare = username.startsWith("@") ? username.slice(1) : username;
  return USERNAME_REGEX.test(bare);
}

/**
 * Extracts all Telegram usernames from a block of text.
 * Handles @mentions, t.me links, and bare usernames.
 * Returns deduplicated results (by lowercase username).
 */
export function extractUsernames(text: string): ParsedUsername[] {
  const seen = new Set<string>();
  const results: ParsedUsername[] = [];

  function add(raw: string, username: string, source: ParsedUsername["source"]) {
    const lower = username.toLowerCase();
    if (seen.has(lower) || RESERVED_PATHS.has(lower)) return;
    seen.add(lower);
    results.push({ raw, username: lower, source });
  }

  // Extract from t.me / telegram.me links
  for (const match of text.matchAll(LINK_REGEX)) {
    add(match[0], match[1], "link");
  }

  // Extract @mentions
  for (const match of text.matchAll(MENTION_REGEX)) {
    add(match[0], match[1], "mention");
  }

  return results;
}

/**
 * Parses a single input that could be a username, @mention, or link.
 * Returns null if the input doesn't look like a valid Telegram username.
 */
export function parseUsername(input: string): ParsedUsername | null {
  const trimmed = input.trim();

  // Try as link first
  const linkMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9])$/
  );
  if (linkMatch) {
    const username = linkMatch[1].toLowerCase();
    if (RESERVED_PATHS.has(username)) return null;
    return { raw: trimmed, username, source: "link" };
  }

  // Try as @mention
  if (trimmed.startsWith("@")) {
    const bare = trimmed.slice(1);
    if (USERNAME_REGEX.test(bare)) {
      return { raw: trimmed, username: bare.toLowerCase(), source: "mention" };
    }
    return null;
  }

  // Try as bare username
  if (USERNAME_REGEX.test(trimmed)) {
    return { raw: trimmed, username: trimmed.toLowerCase(), source: "bare" };
  }

  return null;
}
