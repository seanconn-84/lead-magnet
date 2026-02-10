import { validateUsername } from "./validator";

// We mock the https module to avoid real network calls in tests
jest.mock("node:https", () => {
  const { EventEmitter } = require("events");

  const VALID_PROFILE_HTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Pavel Durov">
      <meta property="og:description" content="Official account">
    </head>
    <body>
      <div class="tgme_page_title"><span dir="auto">Pavel Durov</span></div>
      <div class="tgme_page_extra">@durov</div>
    </body>
    </html>
  `;

  const BOT_PROFILE_HTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="BotFather">
      <meta property="og:description" content="Bot management bot">
    </head>
    <body>
      <div class="tgme_page_title"><span dir="auto">BotFather</span></div>
      <div class="tgme_page_extra">@BotFather</div>
    </body>
    </html>
  `;

  const NOT_FOUND_HTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Telegram: Contact @notarealuser999zzz">
    </head>
    <body>
      <div class="tgme_page_description">
        If you have <strong>Telegram</strong>, you can contact
        <a class="tgme_username_link" href="tg://resolve?domain=notarealuser999zzz">
          <span class="tgme_username_link_label">@notarealuser999zzz</span>
        </a> right away.
      </div>
    </body>
    </html>
  `;

  function createMockResponse(html: string) {
    const res = new EventEmitter();
    (res as any).statusCode = 200;
    (res as any).headers = {};
    process.nextTick(() => {
      res.emit("data", html);
      res.emit("end");
    });
    return res;
  }

  return {
    get: jest.fn((url: string, _opts: any, callback: Function) => {
      const req = new EventEmitter();
      (req as any).destroy = jest.fn();

      let html: string;
      if (typeof url === "string" && url.includes("/durov")) {
        html = VALID_PROFILE_HTML;
      } else if (typeof url === "string" && url.includes("/botfather")) {
        html = BOT_PROFILE_HTML;
      } else if (typeof url === "string" && url.includes("/error_user")) {
        // Simulate a network error
        process.nextTick(() => req.emit("error", new Error("ECONNREFUSED")));
        return req;
      } else {
        html = NOT_FOUND_HTML;
      }

      process.nextTick(() => callback(createMockResponse(html)));
      return req;
    }),
  };
});

describe("validateUsername", () => {
  it("validates an existing user", async () => {
    const result = await validateUsername("durov");
    expect(result.username).toBe("durov");
    expect(result.exists).toBe(true);
    expect(result.displayName).toBe("Pavel Durov");
    expect(result.profileType).toBe("user");
  });

  it("validates a bot username", async () => {
    const result = await validateUsername("BotFather");
    expect(result.username).toBe("botfather");
    expect(result.exists).toBe(true);
    expect(result.displayName).toBe("BotFather");
    expect(result.profileType).toBe("bot");
  });

  it("reports non-existent users", async () => {
    const result = await validateUsername("notarealuser999zzz");
    expect(result.username).toBe("notarealuser999zzz");
    expect(result.exists).toBe(false);
  });

  it("handles @ prefix in input", async () => {
    const result = await validateUsername("@durov");
    expect(result.username).toBe("durov");
    expect(result.exists).toBe(true);
  });

  it("returns error for invalid username format", async () => {
    const result = await validateUsername("ab");
    expect(result.exists).toBe(false);
    expect(result.error).toBe("Invalid username format");
  });

  it("handles network errors gracefully", async () => {
    const result = await validateUsername("error_user");
    expect(result.exists).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });
});
