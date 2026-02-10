/**
 * Express API server for the Telegram username validator.
 *
 * Endpoints:
 *   GET  /                    — Serves the frontend
 *   POST /api/check           — Validate usernames from JSON body
 *   POST /api/upload          — Upload CSV, validate, stream results via SSE
 *   GET  /api/download/:id    — Download results CSV
 */

import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { readCsv, writeCsv, formatCsv } from "../csv";
import { parseUsername } from "../parser";
import { validateUsername, ValidationResult } from "../validator";

const app = express();
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, "../../public")));

// File upload config — store in temp dir
const upload = multer({ dest: os.tmpdir() });

// Store completed jobs for download
const jobs = new Map<
  string,
  { results: (ValidationResult & { originalColumns?: Record<string, string> })[]; fileName: string }
>();

/**
 * POST /api/check
 * Body: { usernames: string[] }
 * Returns: { results: ValidationResult[] }
 */
app.post("/api/check", async (req, res) => {
  const { usernames } = req.body;
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: "Provide an array of usernames" });
  }

  const results: ValidationResult[] = [];
  for (const input of usernames) {
    const parsed = parseUsername(input);
    const username = parsed ? parsed.username : input;
    const result = await validateUsername(username, { timeout: 10_000 });
    results.push(result);
  }

  res.json({ results });
});

/**
 * POST /api/upload
 * Multipart form: file (CSV), column? (string)
 * Streams results as Server-Sent Events for real-time progress.
 */
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const columnOption = req.body.column || undefined;

  let rows;
  try {
    rows = readCsv(req.file.path, {
      column: columnOption,
      skipEmpty: true,
    });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Failed to parse CSV file" });
  }

  // Clean up uploaded file
  fs.unlinkSync(req.file.path);

  if (rows.length === 0) {
    return res.status(400).json({ error: "No usernames found in CSV" });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send total count
  res.write(`data: ${JSON.stringify({ type: "start", total: rows.length })}\n\n`);

  const results: (ValidationResult & { originalColumns?: Record<string, string> })[] = [];
  const concurrency = 5;
  const batchDelay = 500;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (row) => {
        const result = await validateUsername(row.username, { timeout: 10_000 });
        return { ...result, originalColumns: row.columns };
      })
    );

    for (const result of batchResults) {
      results.push(result);
      res.write(
        `data: ${JSON.stringify({
          type: "result",
          index: results.length,
          total: rows.length,
          result: {
            username: result.username,
            exists: result.exists,
            displayName: result.displayName,
            profileType: result.profileType,
            error: result.error,
          },
        })}\n\n`
      );
    }

    // Delay between batches
    if (i + concurrency < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelay));
    }
  }

  // Save results for download
  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  jobs.set(jobId, {
    results,
    fileName: req.file.originalname?.replace(/\.csv$/, "") + "_results.csv",
  });

  // Auto-clean after 30 minutes
  setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);

  res.write(`data: ${JSON.stringify({ type: "done", jobId })}\n\n`);
  res.end();
});

/**
 * GET /api/download/:id
 * Downloads the results CSV for a completed job.
 */
app.get("/api/download/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  const tmpPath = path.join(os.tmpdir(), `tg-results-${req.params.id}.csv`);
  writeCsv(tmpPath, job.results);

  res.download(tmpPath, job.fileName, () => {
    fs.unlink(tmpPath, () => {});
  });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Telegram Username Validator running at http://${HOST}:${PORT}`);
});
