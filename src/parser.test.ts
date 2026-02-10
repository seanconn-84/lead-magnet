import {
  isValidUsernameFormat,
  extractUsernames,
  parseUsername,
} from "./parser";

describe("isValidUsernameFormat", () => {
  it("accepts valid usernames", () => {
    expect(isValidUsernameFormat("durov")).toBe(true);
    expect(isValidUsernameFormat("BotFather")).toBe(true);
    expect(isValidUsernameFormat("test_user_123")).toBe(true);
    expect(isValidUsernameFormat("a1234")).toBe(true);
  });

  it("accepts usernames with @ prefix", () => {
    expect(isValidUsernameFormat("@durov")).toBe(true);
    expect(isValidUsernameFormat("@BotFather")).toBe(true);
  });

  it("rejects usernames that are too short", () => {
    expect(isValidUsernameFormat("ab")).toBe(false);
    expect(isValidUsernameFormat("abc")).toBe(false);
    expect(isValidUsernameFormat("abcd")).toBe(false);
  });

  it("rejects usernames starting with a number", () => {
    expect(isValidUsernameFormat("1user")).toBe(false);
    expect(isValidUsernameFormat("123abc")).toBe(false);
  });

  it("rejects usernames starting with underscore", () => {
    expect(isValidUsernameFormat("_user")).toBe(false);
  });

  it("rejects usernames ending with underscore", () => {
    expect(isValidUsernameFormat("user_")).toBe(false);
  });

  it("rejects usernames with invalid characters", () => {
    expect(isValidUsernameFormat("user-name")).toBe(false);
    expect(isValidUsernameFormat("user.name")).toBe(false);
    expect(isValidUsernameFormat("user name")).toBe(false);
    expect(isValidUsernameFormat("user@name")).toBe(false);
  });
});

describe("extractUsernames", () => {
  it("extracts @mentions from text", () => {
    const results = extractUsernames("Hello @durov, meet @BotFather");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      raw: "@durov",
      username: "durov",
      source: "mention",
    });
    expect(results[1]).toEqual({
      raw: "@BotFather",
      username: "botfather",
      source: "mention",
    });
  });

  it("extracts t.me links", () => {
    const results = extractUsernames(
      "Visit https://t.me/durov or http://t.me/telegram"
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      raw: "https://t.me/durov",
      username: "durov",
      source: "link",
    });
    expect(results[1]).toEqual({
      raw: "http://t.me/telegram",
      username: "telegram",
      source: "link",
    });
  });

  it("extracts telegram.me links", () => {
    const results = extractUsernames("Go to https://telegram.me/durov");
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe("durov");
    expect(results[0].source).toBe("link");
  });

  it("extracts bare t.me links without protocol", () => {
    const results = extractUsernames("Check t.me/durov");
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe("durov");
    expect(results[0].source).toBe("link");
  });

  it("deduplicates usernames (case-insensitive)", () => {
    const results = extractUsernames("@Durov and https://t.me/durov");
    expect(results).toHaveLength(1);
    // Link appears first in extraction order
    expect(results[0].username).toBe("durov");
  });

  it("filters out reserved Telegram paths", () => {
    const results = extractUsernames(
      "https://t.me/joinchat and https://t.me/share and @durov"
    );
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe("durov");
  });

  it("returns empty array for text with no usernames", () => {
    const results = extractUsernames("No usernames here, just text.");
    expect(results).toHaveLength(0);
  });

  it("handles mixed content", () => {
    const text = `
      Contact us:
      - Telegram: @support_team
      - Link: https://t.me/official_channel
      - Also try t.me/BotFather
    `;
    const results = extractUsernames(text);
    expect(results).toHaveLength(3);
    const usernames = results.map((r) => r.username);
    expect(usernames).toContain("support_team");
    expect(usernames).toContain("official_channel");
    expect(usernames).toContain("botfather");
  });
});

describe("parseUsername", () => {
  it("parses @mention format", () => {
    const result = parseUsername("@durov");
    expect(result).toEqual({
      raw: "@durov",
      username: "durov",
      source: "mention",
    });
  });

  it("parses t.me link format", () => {
    const result = parseUsername("https://t.me/durov");
    expect(result).toEqual({
      raw: "https://t.me/durov",
      username: "durov",
      source: "link",
    });
  });

  it("parses bare username", () => {
    const result = parseUsername("durov");
    expect(result).toEqual({
      raw: "durov",
      username: "durov",
      source: "bare",
    });
  });

  it("normalizes to lowercase", () => {
    expect(parseUsername("@BotFather")?.username).toBe("botfather");
    expect(parseUsername("https://t.me/Durov")?.username).toBe("durov");
    expect(parseUsername("TestUser")?.username).toBe("testuser");
  });

  it("trims whitespace", () => {
    expect(parseUsername("  @durov  ")?.username).toBe("durov");
  });

  it("returns null for invalid usernames", () => {
    expect(parseUsername("@ab")).toBeNull();
    expect(parseUsername("@_invalid")).toBeNull();
    expect(parseUsername("123")).toBeNull();
    expect(parseUsername("")).toBeNull();
  });

  it("returns null for reserved paths in links", () => {
    expect(parseUsername("https://t.me/joinchat")).toBeNull();
    expect(parseUsername("t.me/share")).toBeNull();
  });
});
