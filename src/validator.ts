/**
 * Telegram username validator — checks whether a username belongs to an
 * existing user/bot/channel on Telegram by inspecting the public profile
 * page at https://t.me/<username>.
 *
 * Valid (existing) profile pages contain the CSS class "tgme_page_title"
 * and an og:title meta tag with the display name.
 *
 * Non-existent profiles show a generic "contact" page that lacks these
 * markers and contains the text "you can contact @username".
 */

import https from "node:https";
import { isValidUsernameFormat } from "./parser";

export interface ValidationResult {
  username: string;
  exists: boolean;
  displayName?: string;
  description?: string;
  profileType?: "user" | "bot" | "channel" | "group" | "unknown";
  error?: string;
}

export interface ValidatorOptions {
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Max concurrent requests when validating multiple usernames (default: 5) */
  concurrency?: number;
  /** Delay between batches in ms to avoid rate-limiting (default: 500) */
  batchDelay?: number;
}

const DEFAULT_OPTIONS: Required<ValidatorOptions> = {
  timeout: 10_000,
  concurrency: 5,
  batchDelay: 500,
};

/**
 * Fetches raw HTML from a t.me profile page.
 */
function fetchProfilePage(username: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://t.me/${username}`;
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectReq = https.get(
            res.headers.location,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              timeout,
            },
            (redirectRes) => {
              let data = "";
              redirectRes.on("data", (chunk) => (data += chunk));
              redirectRes.on("end", () => resolve(data));
            }
          );
          redirectReq.on("error", reject);
          redirectReq.on("timeout", () => {
            redirectReq.destroy();
            reject(new Error("Request timed out"));
          });
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

/**
 * Parses the t.me HTML to determine if the profile exists and extract info.
 */
function parseProfileHtml(html: string, username: string): ValidationResult {
  // Check for the profile title element — present on valid profiles
  const hasTitleElement = html.includes("tgme_page_title");

  // Extract og:title for display name
  const ogTitleMatch = html.match(
    /<meta\s+property="og:title"\s+content="([^"]+)"/
  );

  // Extract og:description for bio/description
  const ogDescMatch = html.match(
    /<meta\s+property="og:description"\s+content="([^"]+)"/
  );

  // Non-existent user pages contain this text pattern
  const isContactPage =
    html.includes("you can contact") ||
    html.includes("You can contact") ||
    html.includes("can view and join");

  // Check for specific profile type indicators
  const lowerUsername = username.toLowerCase();
  const isBot =
    lowerUsername.endsWith("bot") ||
    lowerUsername.startsWith("bot") ||
    html.includes('"bot"') ||
    html.includes("tgme_action_button_label");
  const hasMembers =
    html.includes("members") || html.includes("subscribers");
  const isChannel = hasMembers && html.includes("tgme_page_extra");
  const isGroup =
    html.includes("members") && !html.includes("subscribers");

  if (!hasTitleElement || !ogTitleMatch) {
    return { username, exists: false };
  }

  // Determine profile type
  let profileType: ValidationResult["profileType"] = "unknown";
  if (isBot) profileType = "bot";
  else if (isChannel) profileType = "channel";
  else if (isGroup) profileType = "group";
  else profileType = "user";

  return {
    username,
    exists: true,
    displayName: decodeHtmlEntities(ogTitleMatch[1]),
    description: ogDescMatch ? decodeHtmlEntities(ogDescMatch[1]) : undefined,
    profileType,
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

/**
 * Validates a single Telegram username by checking its t.me profile page.
 */
export async function validateUsername(
  username: string,
  options?: ValidatorOptions
): Promise<ValidationResult> {
  const defined = Object.fromEntries(
    Object.entries(options ?? {}).filter(([, v]) => v !== undefined)
  );
  const opts = { ...DEFAULT_OPTIONS, ...defined };

  // Normalize — strip @ prefix and lowercase
  const bare = (username.startsWith("@") ? username.slice(1) : username).toLowerCase();

  if (!isValidUsernameFormat(bare)) {
    return {
      username: bare,
      exists: false,
      error: "Invalid username format",
    };
  }

  try {
    const html = await fetchProfilePage(bare, opts.timeout);
    return parseProfileHtml(html, bare);
  } catch (err) {
    return {
      username: bare,
      exists: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validates multiple usernames with concurrency control.
 */
export async function validateUsernames(
  usernames: string[],
  options?: ValidatorOptions
): Promise<ValidationResult[]> {
  const defined = Object.fromEntries(
    Object.entries(options ?? {}).filter(([, v]) => v !== undefined)
  );
  const opts = { ...DEFAULT_OPTIONS, ...defined };
  const results: ValidationResult[] = [];

  // Process in batches
  for (let i = 0; i < usernames.length; i += opts.concurrency) {
    const batch = usernames.slice(i, i + opts.concurrency);
    const batchResults = await Promise.all(
      batch.map((u) => validateUsername(u, opts))
    );
    results.push(...batchResults);

    // Delay between batches to avoid rate-limiting
    if (i + opts.concurrency < usernames.length) {
      await new Promise((resolve) => setTimeout(resolve, opts.batchDelay));
    }
  }

  return results;
}
