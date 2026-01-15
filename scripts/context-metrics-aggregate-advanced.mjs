#!/usr/bin/env node
/**
 * Advanced aggregator for context metrics tests.
 * Handles scaling, exec, and workflow test results.
 *
 * Usage:
 *   node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-scaling --type scaling
 *   node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-exec --type exec
 *   node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-workflow --type workflow
 */

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { input: "context-metrics-runs", type: "basic" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--type") {
      args.type = argv[i + 1];
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

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function summarize(values) {
  if (!values.length) return { min: null, median: null, max: null, mean: null };
  return {
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    mean: Number(mean(values).toFixed(2)),
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

async function aggregateScaling(inputDir, summaryDir) {
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

  // Group by mode
  const groups = new Map();
  for (const log of logs) {
    const key = log.mode;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  const rows = [];
  for (const [mode, group] of groups.entries()) {
    const toolCounts = group.map((g) => g.tool_definitions_count).filter((v) => typeof v === "number");
    const toolBytes = group.map((g) => g.tool_definitions_bytes).filter((v) => typeof v === "number");
    const tokens = group.map((g) => g.total_tokens).filter((v) => typeof v === "number");
    const promptBytes = group.map((g) => g.prompt_bytes).filter((v) => typeof v === "number");
    const latency = group.map((g) => g.latency_ms).filter((v) => typeof v === "number");
    const cost = group.map((g) => g.estimated_cost_usd).filter((v) => typeof v === "number");
    const successRate = group.filter((g) => g.success).length / Math.max(group.length, 1);

    rows.push({
      mode,
      runs: group.length,
      success_rate: Number(successRate.toFixed(3)),
      tool_count_median: summarize(toolCounts).median,
      tool_definitions_bytes_median: summarize(toolBytes).median,
      total_tokens_median: summarize(tokens).median,
      prompt_bytes_median: summarize(promptBytes).median,
      latency_ms_median: summarize(latency).median,
      estimated_cost_usd_median: summarize(cost).median,
    });
  }

  // Sort by tool count
  rows.sort((a, b) => (a.tool_count_median || 0) - (b.tool_count_median || 0));

  const summaryJsonPath = path.join(summaryDir, "summary-scaling.json");
  const summaryCsvPath = path.join(summaryDir, "summary-scaling.csv");
  const summaryMdPath = path.join(summaryDir, "summary-scaling.md");

  await fs.writeFile(summaryJsonPath, JSON.stringify(rows, null, 2) + "\n");
  await fs.writeFile(summaryCsvPath, toCsv(rows));

  const mdLines = [
    "## Scaling Test Summary",
    "",
    `_Aggregated from most recent run batch (${recentDirs.length} timestamp directories)_`,
    "",
    "| Mode | Runs | Success Rate | Tool Count | Tool Def Bytes | Total Tokens | Prompt Bytes | Latency ms | Est. Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    mdLines.push(
      `| ${row.mode} | ${row.runs} | ${row.success_rate} | ${row.tool_count_median ?? ""} | ${row.tool_definitions_bytes_median ?? ""} | ${row.total_tokens_median ?? ""} | ${row.prompt_bytes_median ?? ""} | ${row.latency_ms_median ?? ""} | ${row.estimated_cost_usd_median ?? ""} |`,
    );
  }

  // Add scaling analysis
  mdLines.push("");
  mdLines.push("## Scaling Analysis");
  mdLines.push("");

  const toolboxRow = rows.find((r) => r.mode === "toolbox-1");
  const scaledRows = rows.filter((r) => r.mode.startsWith("scaled-"));

  if (toolboxRow && scaledRows.length > 0) {
    mdLines.push("| Tool Count | Tokens vs Toolbox | Bytes vs Toolbox | Cost vs Toolbox |");
    mdLines.push("| --- | --- | --- | --- |");

    for (const scaled of scaledRows) {
      const tokensDelta = formatDelta(pctDelta(toolboxRow.total_tokens_median, scaled.total_tokens_median));
      const bytesDelta = formatDelta(pctDelta(toolboxRow.tool_definitions_bytes_median, scaled.tool_definitions_bytes_median));
      const costDelta = formatDelta(pctDelta(toolboxRow.estimated_cost_usd_median, scaled.estimated_cost_usd_median));
      mdLines.push(`| ${scaled.tool_count_median} | ${tokensDelta} | ${bytesDelta} | ${costDelta} |`);
    }
  }

  await fs.writeFile(summaryMdPath, mdLines.join("\n") + "\n");
  console.log(`Scaling summary written to ${summaryDir}`);
}

async function aggregateExec(inputDir, summaryDir) {
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

  // Group by mode + task
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
    const resultBytesRaw = group.map((g) => g.result_bytes_raw).filter((v) => typeof v === "number");
    const resultBytesFiltered = group.map((g) => g.result_bytes_filtered).filter((v) => typeof v === "number");
    const cost = group.map((g) => g.estimated_cost_usd).filter((v) => typeof v === "number");
    const successRate = group.filter((g) => g.success).length / Math.max(group.length, 1);

    rows.push({
      mode,
      taskId,
      runs: group.length,
      success_rate: Number(successRate.toFixed(3)),
      total_tokens_median: summarize(tokens).median,
      result_bytes_raw_median: summarize(resultBytesRaw).median,
      result_bytes_filtered_median: summarize(resultBytesFiltered).median,
      estimated_cost_usd_median: summarize(cost).median,
    });
  }

  const summaryJsonPath = path.join(summaryDir, "summary-exec.json");
  const summaryCsvPath = path.join(summaryDir, "summary-exec.csv");
  const summaryMdPath = path.join(summaryDir, "summary-exec.md");

  await fs.writeFile(summaryJsonPath, JSON.stringify(rows, null, 2) + "\n");
  await fs.writeFile(summaryCsvPath, toCsv(rows));

  const mdLines = [
    "## Execution Test Summary",
    "",
    `_Aggregated from most recent run batch (${recentDirs.length} timestamp directories)_`,
    "",
    "| Mode | Task | Runs | Success Rate | Total Tokens | Result Bytes Raw | Result Bytes Filtered | Est. Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    mdLines.push(
      `| ${row.mode} | ${row.taskId} | ${row.runs} | ${row.success_rate} | ${row.total_tokens_median ?? ""} | ${row.result_bytes_raw_median ?? ""} | ${row.result_bytes_filtered_median ?? ""} | ${row.estimated_cost_usd_median ?? ""} |`,
    );
  }

  // Add delta analysis
  mdLines.push("");
  mdLines.push("## Result Filtering Analysis");
  mdLines.push("");

  const byTask = new Map();
  for (const row of rows) {
    if (!byTask.has(row.taskId)) byTask.set(row.taskId, {});
    byTask.get(row.taskId)[row.mode] = row;
  }

  mdLines.push("| Task | Tokens Delta | Result Bytes Delta | Cost Delta |");
  mdLines.push("| --- | --- | --- | --- |");

  for (const [taskId, modes] of byTask.entries()) {
    const baseline = modes["baseline"];
    const toolbox = modes["toolbox"];
    if (!baseline || !toolbox) continue;

    const tokensDelta = formatDelta(pctDelta(baseline.total_tokens_median, toolbox.total_tokens_median));
    const bytesDelta = formatDelta(pctDelta(baseline.result_bytes_raw_median, toolbox.result_bytes_filtered_median));
    const costDelta = formatDelta(pctDelta(baseline.estimated_cost_usd_median, toolbox.estimated_cost_usd_median));
    mdLines.push(`| ${taskId} | ${tokensDelta} | ${bytesDelta} | ${costDelta} |`);
  }

  await fs.writeFile(summaryMdPath, mdLines.join("\n") + "\n");
  console.log(`Exec summary written to ${summaryDir}`);
}

async function aggregateWorkflow(inputDir, summaryDir) {
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
    if (!log || !log.mode || !log.workflowId) continue;
    logs.push(log);
  }

  // Group by mode + workflow
  const groups = new Map();
  for (const log of logs) {
    const key = `${log.mode}::${log.workflowId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  const rows = [];
  for (const [key, group] of groups.entries()) {
    const [mode, workflowId] = key.split("::");
    const tokens = group.map((g) => g.total_tokens).filter((v) => typeof v === "number");
    const cumulativeBytes = group.map((g) => g.cumulative_result_bytes).filter((v) => typeof v === "number");
    const contextGrowth = group.map((g) => g.context_growth_factor).filter((v) => typeof v === "number");
    const cost = group.map((g) => g.estimated_cost_usd).filter((v) => typeof v === "number");
    const completedSteps = group.map((g) => g.completed_steps).filter((v) => typeof v === "number");
    const totalSteps = group[0]?.total_steps || 0;
    const successRate = group.filter((g) => g.success).length / Math.max(group.length, 1);

    // Extract per-turn token counts
    const allTurnTokens = group.flatMap((g) => g.context_tokens_per_turn || []);
    const turnCount = group[0]?.context_tokens_per_turn?.length || 0;

    rows.push({
      mode,
      workflowId,
      runs: group.length,
      success_rate: Number(successRate.toFixed(3)),
      completed_steps_median: summarize(completedSteps).median,
      total_steps: totalSteps,
      total_tokens_median: summarize(tokens).median,
      cumulative_result_bytes_median: summarize(cumulativeBytes).median,
      context_growth_factor_median: summarize(contextGrowth).median,
      estimated_cost_usd_median: summarize(cost).median,
      turn_count: turnCount,
    });
  }

  const summaryJsonPath = path.join(summaryDir, "summary-workflow.json");
  const summaryCsvPath = path.join(summaryDir, "summary-workflow.csv");
  const summaryMdPath = path.join(summaryDir, "summary-workflow.md");

  await fs.writeFile(summaryJsonPath, JSON.stringify(rows, null, 2) + "\n");
  await fs.writeFile(summaryCsvPath, toCsv(rows));

  const mdLines = [
    "## Workflow Test Summary",
    "",
    `_Aggregated from most recent run batch (${recentDirs.length} timestamp directories)_`,
    "",
    "| Mode | Workflow | Runs | Success | Steps | Tokens | Cumul. Bytes | Context Growth | Est. Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    mdLines.push(
      `| ${row.mode} | ${row.workflowId} | ${row.runs} | ${row.success_rate} | ${row.completed_steps_median ?? ""}/${row.total_steps} | ${row.total_tokens_median ?? ""} | ${row.cumulative_result_bytes_median ?? ""} | ${row.context_growth_factor_median ?? ""}x | ${row.estimated_cost_usd_median ?? ""} |`,
    );
  }

  // Add context growth analysis
  mdLines.push("");
  mdLines.push("## Context Growth Analysis");
  mdLines.push("");

  const byWorkflow = new Map();
  for (const row of rows) {
    if (!byWorkflow.has(row.workflowId)) byWorkflow.set(row.workflowId, {});
    byWorkflow.get(row.workflowId)[row.mode] = row;
  }

  mdLines.push("| Workflow | Tokens Delta | Bytes Delta | Growth Factor Delta | Cost Delta |");
  mdLines.push("| --- | --- | --- | --- | --- |");

  for (const [workflowId, modes] of byWorkflow.entries()) {
    const baseline = modes["baseline"];
    const toolbox = modes["toolbox"];
    if (!baseline || !toolbox) continue;

    const tokensDelta = formatDelta(pctDelta(baseline.total_tokens_median, toolbox.total_tokens_median));
    const bytesDelta = formatDelta(pctDelta(baseline.cumulative_result_bytes_median, toolbox.cumulative_result_bytes_median));
    const growthDelta = formatDelta(pctDelta(baseline.context_growth_factor_median, toolbox.context_growth_factor_median));
    const costDelta = formatDelta(pctDelta(baseline.estimated_cost_usd_median, toolbox.estimated_cost_usd_median));
    mdLines.push(`| ${workflowId} | ${tokensDelta} | ${bytesDelta} | ${growthDelta} | ${costDelta} |`);
  }

  await fs.writeFile(summaryMdPath, mdLines.join("\n") + "\n");
  console.log(`Workflow summary written to ${summaryDir}`);
}

async function run() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args.input);
  const summaryDir = path.join(inputDir, "summary");
  await fs.mkdir(summaryDir, { recursive: true });

  if (args.type === "scaling") {
    await aggregateScaling(inputDir, summaryDir);
  } else if (args.type === "exec") {
    await aggregateExec(inputDir, summaryDir);
  } else if (args.type === "workflow") {
    await aggregateWorkflow(inputDir, summaryDir);
  } else {
    console.error(`Unknown type: ${args.type}. Use: scaling, exec, or workflow`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
