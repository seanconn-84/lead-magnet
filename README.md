# Telegram Username Validator

A CLI tool that checks whether usernames exist on Telegram. Feed it a CSV of usernames and get back a CSV telling you which ones are real Telegram accounts.

## Prerequisites

You need **Node.js** (v18 or higher) and **Git** installed.

Check if you have them:

```bash
node --version
git --version
```

If either is missing:
- Node.js: Download from https://nodejs.org (grab the LTS version)
- Git: Download from https://git-scm.com

## Setup

**1. Clone the repo:**

```bash
git clone https://github.com/seanconn-84/lead-magnet.git
cd lead-magnet
```

**2. Switch to the correct branch:**

```bash
git checkout claude/telegram-username-validator-O3L55
```

**3. Install dependencies:**

```bash
npm install
```

**4. Build:**

```bash
npm run build
```

## Usage

### Check usernames from a CSV file

Put your CSV file in the `lead-magnet` folder, then run:

```bash
node dist/index.js check-file yourfile.csv --output results.csv
```

Your CSV needs a header row. The tool auto-detects columns named `username`, `telegram`, `handle`, `tg`, `user`, or `account`. If your column has a different name, specify it:

```bash
node dist/index.js check-file yourfile.csv --column tg_handle --output results.csv
```

Open the results:

```bash
# Mac
open results.csv

# Windows
start results.csv
```

### Check individual usernames

```bash
node dist/index.js check durov BotFather somefakeuser123
```

### Extract usernames from text (no network, just parsing)

```bash
node dist/index.js parse "Contact @durov or visit t.me/telegram"
```

### Extract and validate usernames from text

```bash
node dist/index.js scan "Follow @durov and @BotFather"
```

## Options

| Flag | Description |
|------|-------------|
| `--output results.csv` | Save results to a CSV file |
| `--existing-only` | Only show usernames that exist on Telegram |
| `--column name` | Specify which CSV column has the usernames |
| `--delimiter ";"` | Force a CSV delimiter (auto-detected by default) |
| `--timeout 15000` | HTTP timeout in milliseconds (default: 10000) |
| `--concurrency 3` | Max parallel requests (default: 5) |
| `--format csv` | Print results as CSV to the terminal |

## CSV Input Format

Your input CSV can look like any of these — the tool figures it out:

```csv
username
durov
BotFather
```

```csv
name,username,email
Alice,durov,alice@example.com
Bob,BotFather,bob@example.com
```

```csv
id;telegram;notes
1;durov;VIP
2;BotFather;bot
```

Usernames with `@` prefixes are handled automatically (`@durov` becomes `durov`).

## CSV Output Format

The output CSV includes all original columns from your input plus:

| Column | Description |
|--------|-------------|
| `exists` | `true` if the username is a real Telegram account |
| `profile_type` | `user`, `bot`, `channel`, or `group` |
| `display_name` | The account's display name on Telegram |
| `description` | The account's bio/description |
| `error` | Error message if the check failed |

## Example

```bash
node dist/index.js check-file founders.csv --output results.csv --existing-only
```

This reads `founders.csv`, checks every username against Telegram, and writes only the verified accounts to `results.csv`.

## Running Tests

```bash
npm test
```
