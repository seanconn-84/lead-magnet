#!/usr/bin/env node

/**
 * CLI entry point for the Telegram username validator agent.
 *
 * Usage:
 *   npx telegram-username-validator parse   "text with @users and t.me/links"
 *   npx telegram-username-validator check   user1 @user2 t.me/user3
 *   npx telegram-username-validator scan    "text with @users and t.me/links"
 */

import { parse, check, scan } from "./agent";

const USAGE = `
Telegram Username Validator

Usage:
  telegram-username-validator <command> <args...>

Commands:
  parse <text>           Extract usernames from text (offline)
  check <user...>        Check if usernames exist on Telegram
  scan  <text>           Extract and validate all usernames in text

Options:
  --existing-only        Only show usernames that exist (check/scan)
  --timeout <ms>         HTTP timeout in ms (default: 10000)
  --concurrency <n>      Max parallel requests (default: 5)

Examples:
  telegram-username-validator parse "Contact @durov or visit t.me/telegram"
  telegram-username-validator check durov BotFather notarealuser123
  telegram-username-validator scan "Follow @durov and @BotFather" --existing-only
`.trim();

function parseArgs(argv: string[]) {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(arg);
    }
  }

  return { args, flags };
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === "help" || flags["help"]) {
    console.log(USAGE);
    process.exit(0);
  }

  const options = {
    existingOnly: flags["existing-only"] === true,
    timeout: flags["timeout"] ? Number(flags["timeout"]) : undefined,
    concurrency: flags["concurrency"]
      ? Number(flags["concurrency"])
      : undefined,
  };

  switch (command) {
    case "parse": {
      const text = rest.join(" ");
      if (!text) {
        console.error("Error: provide text to parse");
        process.exit(1);
      }
      const results = parse(text);
      if (results.length === 0) {
        console.log("No Telegram usernames found.");
      } else {
        console.log(`Found ${results.length} username(s):\n`);
        for (const r of results) {
          console.log(`  ${r.username}  (${r.source}: ${r.raw})`);
        }
      }
      break;
    }

    case "check": {
      if (rest.length === 0) {
        console.error("Error: provide one or more usernames to check");
        process.exit(1);
      }
      console.log(`Checking ${rest.length} username(s)...\n`);
      const results = await check(rest, options);
      for (const r of results) {
        const status = r.exists ? "EXISTS" : "NOT FOUND";
        const extra = r.displayName ? ` — ${r.displayName}` : "";
        const type = r.profileType ? ` [${r.profileType}]` : "";
        const err = r.error ? ` (${r.error})` : "";
        console.log(`  ${r.username}: ${status}${type}${extra}${err}`);
      }
      const existing = results.filter((r) => r.exists).length;
      console.log(
        `\n${existing}/${results.length} username(s) verified as existing.`
      );
      break;
    }

    case "scan": {
      const text = rest.join(" ");
      if (!text) {
        console.error("Error: provide text to scan");
        process.exit(1);
      }
      console.log("Scanning text for Telegram usernames...\n");
      const { parsed, validated } = await scan(text, options);
      console.log(`Extracted ${parsed.length} username(s), validated results:\n`);
      for (const r of validated) {
        const status = r.exists ? "EXISTS" : "NOT FOUND";
        const extra = r.displayName ? ` — ${r.displayName}` : "";
        const type = r.profileType ? ` [${r.profileType}]` : "";
        const err = r.error ? ` (${r.error})` : "";
        console.log(`  ${r.username}: ${status}${type}${extra}${err}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
