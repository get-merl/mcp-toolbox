import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { input: "context-metrics-runs" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function listFilesRecursively(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function summarize(values) {
  if (!values.length) return { min: null, median: null, max: null };
  return {
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
  };
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function pctDelta(baseline, toolbox) {
  if (typeof baseline !== "number" || typeof toolbox !== "number") return null;
  if (baseline === 0) return null;
  return Number((((toolbox - baseline) / baseline) * 100).toFixed(2));
}

function formatDelta(value) {
  if (value === null || Number.isNaN(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

async function findMostRecentRunDirs(inputDir) {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const timestampDirs = entries
    .filter((e) => e.isDirectory() && e.name.match(/^\d{4}-\d{2}-\d{2}T/))
    .map((e) => e.name)
    .sort()
    .reverse();

  if (timestampDirs.length === 0) return [];

  return timestampDirs.slice(0, 2);
}

async function run() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args.input);
  const summaryDir = path.join(inputDir, "summary");
  await fs.mkdir(summaryDir, { recursive: true });

  const recentDirs = await findMostRecentRunDirs(inputDir);
  const recentDirSet = new Set(recentDirs);

  const files = await listFilesRecursively(inputDir);
  const logs = [];
  for (const file of files) {
    if (file.includes(`${path.sep}summary${path.sep}`)) continue;
    if (file.endsWith("run.meta.json")) continue;
    const fileDir = path.dirname(file);
    const parts = fileDir.split(path.sep);
    const timestampDir = parts.find((p) => p.match(/^\d{4}-\d{2}-\d{2}T/));
    if (!timestampDir || !recentDirSet.has(timestampDir)) continue;
    const log = await readJson(file);
    if (!log || !log.mode || !log.taskId) continue;
    logs.push(log);
  }

  const groups = new Map();
  for (const log of logs) {
    const key = `${log.mode}::${log.taskId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  const rows = [];
  for (const [key, group] of groups.entries()) {
    const [mode, taskId] = key.split("::");
    const tokens = group.map((g) => g.total_tokens).filter((v) => typeof v === "number");
    const promptTokens = group.map((g) => g.prompt_tokens).filter((v) => typeof v === "number");
    const completionTokens = group
      .map((g) => g.completion_tokens)
      .filter((v) => typeof v === "number");
    const latency = group.map((g) => g.latency_ms).filter((v) => typeof v === "number");
    const promptBytes = group.map((g) => g.prompt_bytes).filter((v) => typeof v === "number");
    const toolBytes = group
      .map((g) => g.tool_definitions_bytes)
      .filter((v) => typeof v === "number");
    const successRate = group.filter((g) => g.success).length / Math.max(group.length, 1);
    const estimatedCost = group
      .map((g) => g.estimated_cost_usd)
      .filter((v) => typeof v === "number");

    rows.push({
      mode,
      taskId,
      runs: group.length,
      success_rate: Number(successRate.toFixed(3)),
      total_tokens_min: summarize(tokens).min,
      total_tokens_median: summarize(tokens).median,
      total_tokens_max: summarize(tokens).max,
      prompt_tokens_median: summarize(promptTokens).median,
      completion_tokens_median: summarize(completionTokens).median,
      latency_ms_median: summarize(latency).median,
      prompt_bytes_median: summarize(promptBytes).median,
      tool_definitions_bytes_median: summarize(toolBytes).median,
      estimated_cost_usd_median: summarize(estimatedCost).median,
    });
  }

  const summaryJsonPath = path.join(summaryDir, "summary.json");
  const summaryCsvPath = path.join(summaryDir, "summary.csv");
  const summaryMdPath = path.join(summaryDir, "summary.md");

  await fs.writeFile(summaryJsonPath, JSON.stringify(rows, null, 2) + "\n");
  await fs.writeFile(summaryCsvPath, toCsv(rows));

  const mdLines = [
    "## Context Metrics Summary",
    "",
    `_Aggregated from most recent run batch (${recentDirs.length} timestamp director${recentDirs.length === 1 ? "y" : "ies"})_`,
    "",
    "| Mode | Task | Runs | Success Rate | Tokens (median) | Prompt Bytes (median) | Tool Def Bytes (median) | Latency ms (median) | Est. Cost (median) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    mdLines.push(
      `| ${row.mode} | ${row.taskId} | ${row.runs} | ${row.success_rate} | ${row.total_tokens_median ?? ""} | ${row.prompt_bytes_median ?? ""} | ${row.tool_definitions_bytes_median ?? ""} | ${row.latency_ms_median ?? ""} | ${row.estimated_cost_usd_median ?? ""} |`,
    );
  }
  mdLines.push("", "## Delta (Toolbox vs Baseline)", "");

  const byTask = new Map();
  for (const row of rows) {
    if (!byTask.has(row.taskId)) byTask.set(row.taskId, {});
    byTask.get(row.taskId)[row.mode] = row;
  }

  mdLines.push(
    "| Task | Tokens (median) | Prompt Bytes (median) | Tool Def Bytes (median) | Latency ms (median) | Est. Cost (median) |"
  );
  mdLines.push("| --- | --- | --- | --- | --- | --- |");

  for (const [taskId, modes] of byTask.entries()) {
    const baseline = modes["baseline"];
    const toolbox = modes["toolbox"];
    if (!baseline || !toolbox) continue;
    const deltaTokens = formatDelta(
      pctDelta(baseline.total_tokens_median, toolbox.total_tokens_median)
    );
    const deltaPromptBytes = formatDelta(
      pctDelta(baseline.prompt_bytes_median, toolbox.prompt_bytes_median)
    );
    const deltaToolBytes = formatDelta(
      pctDelta(baseline.tool_definitions_bytes_median, toolbox.tool_definitions_bytes_median)
    );
    const deltaLatency = formatDelta(
      pctDelta(baseline.latency_ms_median, toolbox.latency_ms_median)
    );
    const deltaCost = formatDelta(
      pctDelta(baseline.estimated_cost_usd_median, toolbox.estimated_cost_usd_median)
    );
    mdLines.push(
      `| ${taskId} | ${deltaTokens} | ${deltaPromptBytes} | ${deltaToolBytes} | ${deltaLatency} | ${deltaCost} |`
    );
  }

  await fs.writeFile(summaryMdPath, mdLines.join("\n") + "\n");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
