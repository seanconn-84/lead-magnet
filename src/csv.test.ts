import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readCsv, writeCsv, formatCsv } from "./csv";

function tmpFile(content: string, ext = ".csv"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-csv-test-"));
  const file = path.join(dir, `test${ext}`);
  fs.writeFileSync(file, content, "utf-8");
  return file;
}

describe("readCsv", () => {
  it("reads a basic CSV with a username column", () => {
    const file = tmpFile(
      "name,username,email\nAlice,durov,a@test.com\nBob,botfather,b@test.com\n"
    );
    const rows = readCsv(file);
    expect(rows).toHaveLength(2);
    expect(rows[0].username).toBe("durov");
    expect(rows[1].username).toBe("botfather");
    expect(rows[0].columns).toEqual({
      name: "Alice",
      username: "durov",
      email: "a@test.com",
    });
  });

  it("auto-detects 'telegram' column", () => {
    const file = tmpFile("id,telegram,notes\n1,durov,vip\n2,testuser,regular\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
    expect(rows[1].username).toBe("testuser");
  });

  it("auto-detects 'handle' column", () => {
    const file = tmpFile("handle,status\ndurov,active\nbotfather,active\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
  });

  it("strips @ prefix from usernames", () => {
    const file = tmpFile("username\n@durov\n@botfather\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
    expect(rows[1].username).toBe("botfather");
  });

  it("uses explicit column name", () => {
    const file = tmpFile("id,tg_handle,notes\n1,durov,test\n2,testuser,test\n");
    const rows = readCsv(file, { column: "tg_handle" });
    expect(rows[0].username).toBe("durov");
  });

  it("uses explicit column index", () => {
    const file = tmpFile("a,b,c\nx,durov,z\nx,testuser,z\n");
    const rows = readCsv(file, { column: 1 });
    expect(rows[0].username).toBe("durov");
  });

  it("skips empty username rows by default", () => {
    const file = tmpFile("username\ndurov\n\nbotfather\n");
    const rows = readCsv(file);
    expect(rows).toHaveLength(2);
  });

  it("keeps empty-cell rows when skipEmpty is false", () => {
    const file = tmpFile("username,notes\n,keep this\ndurov,vip\n");
    const rows = readCsv(file, { skipEmpty: false });
    expect(rows).toHaveLength(2);
    expect(rows[0].username).toBe("");
    expect(rows[0].columns["notes"]).toBe("keep this");
  });

  it("handles semicolon delimiter", () => {
    const file = tmpFile("name;username;email\nAlice;durov;a@test.com\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
  });

  it("handles tab delimiter", () => {
    const file = tmpFile("name\tusername\temail\nAlice\tdurov\ta@test.com\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
  });

  it("handles quoted fields", () => {
    const file = tmpFile(
      'username,notes\ndurov,"Has a comma, in notes"\nbotfather,"Simple"\n'
    );
    const rows = readCsv(file);
    expect(rows).toHaveLength(2);
    expect(rows[0].username).toBe("durov");
    expect(rows[0].columns["notes"]).toBe("Has a comma, in notes");
  });

  it("handles escaped quotes in fields", () => {
    const file = tmpFile(
      'username,notes\ndurov,"He said ""hello"""\n'
    );
    const rows = readCsv(file);
    expect(rows[0].columns["notes"]).toBe('He said "hello"');
  });

  it("falls back to first column when no header matches", () => {
    const file = tmpFile("data,other\ndurov,123\nbotfather,456\n");
    const rows = readCsv(file);
    expect(rows[0].username).toBe("durov");
  });

  it("returns empty array for empty file", () => {
    const file = tmpFile("");
    const rows = readCsv(file);
    expect(rows).toHaveLength(0);
  });

  it("handles Windows-style line endings", () => {
    const file = tmpFile("username\r\ndurov\r\nbotfather\r\n");
    const rows = readCsv(file);
    expect(rows).toHaveLength(2);
    expect(rows[0].username).toBe("durov");
  });
});

describe("writeCsv", () => {
  it("writes results to a CSV file", () => {
    const outPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "tg-csv-out-")),
      "results.csv"
    );

    writeCsv(outPath, [
      {
        username: "durov",
        exists: true,
        displayName: "Pavel Durov",
        profileType: "user",
      },
      {
        username: "fakeuser",
        exists: false,
        error: "Not found",
      },
    ]);

    const content = fs.readFileSync(outPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines[0]).toBe("username,exists,profile_type,display_name,description,error");
    expect(lines[1]).toContain("durov");
    expect(lines[1]).toContain("true");
    expect(lines[1]).toContain("Pavel Durov");
    expect(lines[2]).toContain("fakeuser");
    expect(lines[2]).toContain("false");
    expect(lines[2]).toContain("Not found");
  });

  it("preserves original columns in output", () => {
    const outPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "tg-csv-out-")),
      "results.csv"
    );

    writeCsv(outPath, [
      {
        username: "durov",
        exists: true,
        displayName: "Pavel Durov",
        profileType: "user",
        originalColumns: { name: "Alice", username: "durov", source: "web" },
      },
    ]);

    const content = fs.readFileSync(outPath, "utf-8");
    const header = content.split("\n")[0];
    expect(header).toContain("name");
    expect(header).toContain("source");
  });
});

describe("formatCsv", () => {
  it("formats results as CSV string", () => {
    const csv = formatCsv([
      { username: "durov", exists: true, displayName: "Pavel Durov", profileType: "user" },
      { username: "fakeuser", exists: false, error: "Not found" },
    ]);

    const lines = csv.split("\n");
    expect(lines[0]).toBe("username,exists,profile_type,display_name,error");
    expect(lines[1]).toBe("durov,true,user,Pavel Durov,");
    expect(lines[2]).toBe("fakeuser,false,,,Not found");
  });

  it("escapes fields with commas", () => {
    const csv = formatCsv([
      {
        username: "testuser",
        exists: true,
        displayName: "Doe, John",
        profileType: "user",
      },
    ]);

    expect(csv).toContain('"Doe, John"');
  });
});
