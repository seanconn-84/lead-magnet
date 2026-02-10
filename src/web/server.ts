/**
 * Express API server for the Telegram username validator.
 *
 * Endpoints:
 *   GET  /                           — Serves the frontend
 *   POST /api/check                  — Validate usernames from JSON body
 *   POST /api/upload                 — Upload CSV, start background validation job
 *   GET  /api/jobs/:id               — Poll job progress
 *   GET  /api/download/:id           — Download all results CSV
 *   GET  /api/download/:id/existing  — Download only existing usernames CSV
 */

import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { readCsv, writeCsv } from "../csv";
import { parseUsername } from "../parser";
import { validateUsername, ValidationResult } from "../validator";

const app = express();
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, "../../public")));

// File upload config — store in temp dir
const upload = multer({ dest: os.tmpdir() });

interface JobResult extends ValidationResult {
  originalColumns?: Record<string, string>;
}

interface Job {
  status: "processing" | "done";
  total: number;
  processed: number;
  results: JobResult[];
  fileName: string;
}

const jobs = new Map<string, Job>();

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
 * Runs validation in the background for a job.
 */
async function processJob(jobId: string, rows: { username: string; columns: Record<string, string> }[]) {
  const job = jobs.get(jobId);
  if (!job) return;

  const concurrency = 5;
  const batchDelay = 300;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (row) => {
        const result = await validateUsername(row.username, { timeout: 10_000 });
        return { ...result, originalColumns: row.columns } as JobResult;
      })
    );

    job.results.push(...batchResults);
    job.processed = job.results.length;

    if (i + concurrency < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelay));
    }
  }

  job.status = "done";

  // Auto-clean after 1 hour
  setTimeout(() => jobs.delete(jobId), 60 * 60 * 1000);
}

/**
 * POST /api/upload
 * Multipart form: file (CSV), column? (string)
 * Returns: { jobId, total } — then poll GET /api/jobs/:id for progress.
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

  fs.unlinkSync(req.file.path);

  if (rows.length === 0) {
    return res.status(400).json({ error: "No usernames found in CSV" });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const job: Job = {
    status: "processing",
    total: rows.length,
    processed: 0,
    results: [],
    fileName: (req.file.originalname?.replace(/\.csv$/, "") || "results") + "_results.csv",
  };

  jobs.set(jobId, job);

  // Start processing in the background — don't await
  processJob(jobId, rows);

  res.json({ jobId, total: rows.length });
});

/**
 * GET /api/jobs/:id
 * Returns current job status and recent results for polling.
 * Query params:
 *   after=N — only return results after index N (for incremental updates)
 */
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  const after = parseInt(req.query.after as string) || 0;
  const newResults = job.results.slice(after).map((r) => ({
    username: r.username,
    exists: r.exists,
    displayName: r.displayName,
    profileType: r.profileType,
    error: r.error,
  }));

  res.json({
    status: job.status,
    total: job.total,
    processed: job.processed,
    results: newResults,
  });
});

/**
 * GET /api/download/:id
 * Downloads the full results CSV.
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

/**
 * GET /api/download/:id/existing
 * Downloads CSV containing only usernames that exist.
 */
app.get("/api/download/:id/existing", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  const existing = job.results.filter((r) => r.exists);
  const tmpPath = path.join(os.tmpdir(), `tg-existing-${req.params.id}.csv`);
  const fileName = (job.fileName?.replace(/_results\.csv$/, "") || "existing") + "_existing.csv";
  writeCsv(tmpPath, existing);

  res.download(tmpPath, fileName, () => {
    fs.unlink(tmpPath, () => {});
  });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Telegram Username Validator running at http://${HOST}:${PORT}`);
});
