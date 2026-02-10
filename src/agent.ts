/**
 * Telegram username parsing + validation agent.
 *
 * Modes:
 *   parse   — Extract usernames from text (no network calls)
 *   check   — Validate one or more usernames against t.me
 *   scan    — Extract usernames from text AND validate them all
 */

import { extractUsernames, parseUsername, ParsedUsername } from "./parser";
import {
  validateUsername,
  validateUsernames,
  ValidationResult,
  ValidatorOptions,
} from "./validator";

export interface AgentResult {
  parsed: ParsedUsername[];
  validated: ValidationResult[];
}

export interface AgentOptions extends ValidatorOptions {
  /** When true, only return usernames that exist */
  existingOnly?: boolean;
}

/**
 * Parse-only: extracts usernames from text without making network calls.
 */
export function parse(text: string): ParsedUsername[] {
  return extractUsernames(text);
}

/**
 * Check one or more usernames against Telegram.
 * Accepts usernames in any format (@user, t.me/user, bare).
 */
export async function check(
  inputs: string[],
  options?: AgentOptions
): Promise<ValidationResult[]> {
  const usernames = inputs
    .map((input) => {
      const parsed = parseUsername(input);
      return parsed ? parsed.username : input;
    });

  const results = await validateUsernames(usernames, options);

  if (options?.existingOnly) {
    return results.filter((r) => r.exists);
  }
  return results;
}

/**
 * Scan text: extract all usernames and validate every one.
 */
export async function scan(
  text: string,
  options?: AgentOptions
): Promise<AgentResult> {
  const parsed = extractUsernames(text);
  const usernames = parsed.map((p) => p.username);
  const validated = await validateUsernames(usernames, options);

  return {
    parsed,
    validated: options?.existingOnly
      ? validated.filter((r) => r.exists)
      : validated,
  };
}
