import { parse } from "./agent";

describe("agent parse", () => {
  it("extracts usernames from text", () => {
    const results = parse(
      "Contact @durov or visit https://t.me/telegram for updates"
    );
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.username).sort()).toEqual(["durov", "telegram"]);
  });

  it("returns empty for text with no usernames", () => {
    const results = parse("Just regular text, nothing to see here.");
    expect(results).toHaveLength(0);
  });

  it("deduplicates across formats", () => {
    const results = parse("@durov t.me/durov https://t.me/Durov");
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe("durov");
  });
});
