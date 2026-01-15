#!/usr/bin/env node
/**
 * Combined runner for context metrics tests.
 * Tests both tool definition overhead (scaling) and result filtering together.
 *
 * Usage:
 *   node scripts/context-metrics-runner-combined.mjs --config scripts/context-metrics/config-combined.json --mode baseline-100
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = "scripts/context-metrics/config-combined.json";

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG, mode: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      args.config = argv[i + 1];
      i += 1;
    } else if (arg === "--mode") {
      args.mode = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function loadEnvFile(filePath) {
  const exists = await fileExists(filePath);
  if (!exists) return;
  const content = await fs.readFile(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    process.env[key] = value;
  }
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function nowIsoSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toBytes(value) {
  if (typeof value === "string") return Buffer.byteLength(value, "utf-8");
  return Buffer.byteLength(JSON.stringify(value), "utf-8");
}

const STRICT_OUTPUT_INSTRUCTIONS = [
  "Output ONLY a JSON object with keys tool_name and arguments.",
  "Do NOT include backticks, markdown, or extra text.",
  "tool_name must exactly match one of the tools listed.",
  "arguments must be a JSON object matching the tool schema.",
].join(" ");

function buildToolDefinitionsText({ tools, serverSlug }) {
  if (!tools.length) return "";
  return tools
    .map((tool) => {
      const name = `${serverSlug}.${tool.name}`;
      const description = tool.description ? `\n  description: ${tool.description}` : "";
      const schema = tool.inputSchema ? `\n  inputSchema: ${JSON.stringify(tool.inputSchema)}` : "";
      return `- name: ${name}${description}${schema}`;
    })
    .join("\n");
}

function buildPrompt({ systemBase, userSuffix, toolText, taskPrompt }) {
  const system = `${systemBase}\n\n${STRICT_OUTPUT_INSTRUCTIONS}\n\nTOOLS:\n${toolText}\n\nTool name format: <serverSlug>.<toolName>`;
  const user = `${taskPrompt}\n${userSuffix}\n${STRICT_OUTPUT_INSTRUCTIONS}`;
  return { system, user };
}

function estimateCost(pricing, usage) {
  if (!pricing) return null;
  const input = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
  const output = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
  const inputCost = (input / 1_000_000) * pricing.input_per_1m;
  const outputCost = (output / 1_000_000) * pricing.output_per_1m;
  return Number((inputCost + outputCost).toFixed(6));
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const snippet = text.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    return null;
  }
}

function resolveOpenAIMaxParam(provider, model) {
  if (provider?.maxTokensParam === "max_completion_tokens") return "max_completion_tokens";
  if (provider?.maxTokensParam === "max_tokens") return "max_tokens";
  if (typeof model === "string" && model.startsWith("gpt-5")) return "max_completion_tokens";
  return "max_tokens";
}

async function callOpenAI({ apiKey, model, system, user, provider, maxTokens = 500 }) {
  const maxParam = resolveOpenAIMaxParam(provider, model);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      [maxParam]: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json?.error?.message || "OpenAI request failed");
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? null,
      completion_tokens: json.usage?.completion_tokens ?? null,
      total_tokens: json.usage?.total_tokens ?? null,
    },
    raw: json,
  };
}

async function callOpenAIWithMessages({ apiKey, model, messages, provider, maxTokens = 1000 }) {
  const maxParam = resolveOpenAIMaxParam(provider, model);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      [maxParam]: maxTokens,
      messages,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json?.error?.message || "OpenAI request failed");
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? null,
      completion_tokens: json.usage?.completion_tokens ?? null,
      total_tokens: json.usage?.total_tokens ?? null,
    },
    raw: json,
  };
}

async function loadSnapshotTools({ snapshotsDir, serverSlug }) {
  const snapshotPath = path.join(snapshotsDir, serverSlug, "latest.json");
  const exists = await fileExists(snapshotPath);
  if (!exists) {
    throw new Error(`Missing snapshot: ${snapshotPath}`);
  }
  const snapshot = await readJson(snapshotPath);
  return snapshot.tools || [];
}

async function listSnapshotServers(snapshotsDir) {
  const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function loadSyntheticTools(syntheticToolsPath) {
  const exists = await fileExists(syntheticToolsPath);
  if (!exists) {
    throw new Error(`Missing synthetic tools file: ${syntheticToolsPath}`);
  }
  const data = await readJson(syntheticToolsPath);
  const all = [];
  for (const server of data.servers || []) {
    for (const tool of server.tools || []) {
      all.push({ ...tool, __serverSlug: server.serverSlug });
    }
  }
  return all;
}

async function buildToolSet({ mode, task, snapshotsDir, syntheticToolsPath }) {
  if (mode.toolDefinitionScope === "taskToolsOnly") {
    const tools = await loadSnapshotTools({
      snapshotsDir,
      serverSlug: task.serverSlug,
    });
    return tools.filter((tool) => task.toolNames.includes(tool.name));
  }

  if (mode.toolDefinitionScope === "serverOnly") {
    return await loadSnapshotTools({
      snapshotsDir,
      serverSlug: task.serverSlug,
    });
  }

  if (mode.toolDefinitionScope === "scaledBaseline") {
    // Baseline scaling: include ALL server tools (not just task tools) up to target count
    // Cycle through available tools if target count exceeds available tools
    const targetCount = mode.toolCount || 100;
    const realTools = await loadSnapshotTools({
      snapshotsDir,
      serverSlug: task.serverSlug,
    });
    const syntheticTools = syntheticToolsPath ? await loadSyntheticTools(syntheticToolsPath) : [];
    const allTools = [...realTools, ...syntheticTools];

    if (allTools.length === 0) {
      return [];
    }

    // If we need more tools than available, cycle through them
    if (targetCount <= allTools.length) {
      return allTools.slice(0, targetCount);
    }

    // Cycle through tools to reach target count
    const result = [];
    for (let i = 0; i < targetCount; i++) {
      const tool = allTools[i % allTools.length];
      result.push({ ...tool, __cycleIndex: i });
    }
    return result;
  }

  throw new Error(`Unknown toolDefinitionScope: ${mode.toolDefinitionScope}`);
}

function resolveServerSlug(tool, fallbackSlug) {
  return tool.__serverSlug || fallbackSlug;
}

/**
 * Call an MCP tool using the generated wrapper
 */
async function executeMcpTool({ serverSlug, toolName, args, toolboxDir }) {
  const toolPath = path.join(toolboxDir, "servers", serverSlug, "tools", `${toolName}.ts`);
  const exists = await fileExists(toolPath);
  if (!exists) {
    throw new Error(`Tool not found: ${toolPath}`);
  }

  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", toolPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Tool execution failed (exit ${code}): ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        resolve({ raw: stdout });
      }
    });

    child.on("error", reject);

    child.stdin.write(JSON.stringify(args || {}));
    child.stdin.end();
  });
}

function parseToolName(fullName) {
  const [serverSlug, ...rest] = fullName.split(".");
  const toolName = rest.join(".");
  // Convert snake_case to camelCase for file lookup
  const fileName = toolName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return { serverSlug, toolName, fileName };
}

/**
 * Filter/transform a large result for toolbox mode
 */
function filterResult(result, filterConfig) {
  if (!filterConfig) return result;

  const resultStr = typeof result === "string" ? result : JSON.stringify(result);
  let resultObj;
  try {
    resultObj = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    // If it's not JSON, treat as string
    resultObj = result;
  }

  if (filterConfig.type === "truncate") {
    const maxChars = filterConfig.maxChars || 2000;
    if (resultStr.length > maxChars) {
      return {
        _truncated: true,
        _originalLength: resultStr.length,
        preview: resultStr.slice(0, maxChars) + "...",
      };
    }
    return result;
  }

  if (filterConfig.type === "summarize_array") {
    if (Array.isArray(resultObj)) {
      return {
        _summarized: true,
        count: resultObj.length,
        sample: resultObj.slice(0, filterConfig.sampleSize || 3),
        fields: resultObj[0] ? Object.keys(resultObj[0]) : [],
      };
    }
    if (resultObj?.content && Array.isArray(resultObj.content)) {
      return {
        _summarized: true,
        count: resultObj.content.length,
        sample: resultObj.content.slice(0, filterConfig.sampleSize || 3),
      };
    }
    return result;
  }

  if (filterConfig.type === "extract_fields") {
    const fields = filterConfig.fields || [];
    if (Array.isArray(resultObj)) {
      return resultObj.map((item) => {
        const extracted = {};
        for (const field of fields) {
          if (field in item) extracted[field] = item[field];
        }
        return extracted;
      });
    }
    const extracted = {};
    for (const field of fields) {
      if (field in resultObj) extracted[field] = resultObj[field];
    }
    return extracted;
  }

  return result;
}

async function run() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  const config = await readJson(configPath);

  await loadEnvFile(path.resolve(".env"));

  const tasksPath = path.resolve(config.tasksFile);
  const tasks = await readJson(tasksPath);
  const snapshotsDir = path.resolve(config.snapshotsDir);
  const syntheticToolsPath = config.syntheticToolsFile
    ? path.resolve(config.syntheticToolsFile)
    : null;
  const toolboxDir = path.resolve(config.toolboxDir || "toolbox");
  const outputRoot = path.resolve(config.outputDir);
  const runStamp = nowIsoSlug();
  const runId = randomUUID();

  const modes = args.mode ? config.modes.filter((m) => m.name === args.mode) : config.modes;

  if (!modes.length) {
    throw new Error(`No modes matched. Requested mode: ${args.mode}`);
  }

  const provider = config.provider;
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key env: ${provider.apiKeyEnv}`);
  }

  for (const mode of modes) {
    for (const task of tasks) {
      for (let i = 0; i < config.runsPerTask; i += 1) {
        const log = {
          runId,
          mode: mode.name,
          taskId: task.id,
          provider: provider.kind,
          model: provider.model,
          tool_definition_scope: mode.toolDefinitionScope,
          filter_result: mode.filterResult || false,
          steps: [],
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_tokens: 0,
          latency_ms: 0,
        };

        try {
          // Step 1: Generate tool call with tool definitions in context
          const tools = await buildToolSet({ mode, task, snapshotsDir, syntheticToolsPath });
          const toolText = tools
            .map((tool) =>
              buildToolDefinitionsText({
                tools: [tool],
                serverSlug: resolveServerSlug(tool, task.serverSlug),
              }),
            )
            .join("\n");

          const prompt = buildPrompt({
            systemBase: config.prompt.system,
            userSuffix: config.prompt.userSuffix,
            toolText,
            taskPrompt: task.prompt,
          });

          const toolDefsBytes = toBytes(toolText);
          const toolDefsCount = tools.length;

          const step1Start = Date.now();
          const step1Result = await callOpenAI({
            apiKey,
            model: provider.model,
            system: prompt.system,
            user: prompt.user,
            provider,
            maxTokens: 300,
          });
          const step1Latency = Date.now() - step1Start;

          const parsedToolCall = extractJson(step1Result.text);
          log.steps.push({
            step: "tool_call_generation",
            prompt_tokens: step1Result.usage.prompt_tokens,
            completion_tokens: step1Result.usage.completion_tokens,
            total_tokens: step1Result.usage.total_tokens,
            latency_ms: step1Latency,
            tool_definitions_count: toolDefsCount,
            tool_definitions_bytes: toolDefsBytes,
            response: step1Result.text,
            parsed_tool_call: parsedToolCall,
          });

          log.total_prompt_tokens += step1Result.usage.prompt_tokens || 0;
          log.total_completion_tokens += step1Result.usage.completion_tokens || 0;
          log.total_tokens += step1Result.usage.total_tokens || 0;

          if (!parsedToolCall || !parsedToolCall.tool_name) {
            throw new Error("Model did not return a valid tool call");
          }

          // Step 2: Execute the tool
          const { serverSlug, fileName } = parseToolName(parsedToolCall.tool_name);
          const step2Start = Date.now();
          let toolResult;
          try {
            toolResult = await executeMcpTool({
              serverSlug,
              toolName: fileName,
              args: parsedToolCall.arguments || {},
              toolboxDir,
            });
          } catch (execError) {
            log.steps.push({
              step: "tool_execution",
              error: execError.message,
              latency_ms: Date.now() - step2Start,
            });
            throw execError;
          }
          const step2Latency = Date.now() - step2Start;

          const rawResultBytes = toBytes(toolResult);
          log.result_bytes_raw = rawResultBytes;

          // Step 3: Filter result for toolbox mode
          let filteredResult = toolResult;
          if (mode.filterResult && task.filterConfig) {
            filteredResult = filterResult(toolResult, task.filterConfig);
          }
          const filteredResultBytes = toBytes(filteredResult);
          log.result_bytes_filtered = filteredResultBytes;

          log.steps.push({
            step: "tool_execution",
            latency_ms: step2Latency,
            result_bytes_raw: rawResultBytes,
            result_bytes_filtered: filteredResultBytes,
            filter_applied: mode.filterResult && task.filterConfig ? task.filterConfig.type : null,
          });

          // Step 4: Get final response from model with tool result
          const resultToSend = mode.filterResult ? filteredResult : toolResult;
          const resultStr =
            typeof resultToSend === "string" ? resultToSend : JSON.stringify(resultToSend, null, 2);

          const step4Messages = [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
            { role: "assistant", content: step1Result.text },
            {
              role: "user",
              content: `Tool result:\n${resultStr}\n\nBased on this result, provide a brief summary or answer.`,
            },
          ];

          const step4Start = Date.now();
          const step4Result = await callOpenAIWithMessages({
            apiKey,
            model: provider.model,
            messages: step4Messages,
            provider,
            maxTokens: 500,
          });
          const step4Latency = Date.now() - step4Start;

          log.steps.push({
            step: "result_processing",
            prompt_tokens: step4Result.usage.prompt_tokens,
            completion_tokens: step4Result.usage.completion_tokens,
            total_tokens: step4Result.usage.total_tokens,
            latency_ms: step4Latency,
            result_bytes_in_context: toBytes(resultStr),
            response: step4Result.text,
          });

          log.total_prompt_tokens += step4Result.usage.prompt_tokens || 0;
          log.total_completion_tokens += step4Result.usage.completion_tokens || 0;
          log.total_tokens += step4Result.usage.total_tokens || 0;

          log.tool_definitions_count = toolDefsCount;
          log.tool_definitions_bytes = toolDefsBytes;
          log.prompt_bytes = toBytes(prompt.system) + toBytes(prompt.user);
          log.latency_ms = Date.now() - step1Start;
          log.response_bytes = toBytes(step4Result.text);
          log.estimated_cost_usd = estimateCost(config.pricing, {
            prompt_tokens: log.total_prompt_tokens,
            completion_tokens: log.total_completion_tokens,
          });
          log.success = true;
        } catch (error) {
          log.error = {
            message: error.message,
            stack: error.stack,
          };
        }

        // Write log
        const outDir = path.join(outputRoot, runStamp, mode.name, task.id);
        await fs.mkdir(outDir, { recursive: true });
        const logPath = path.join(outDir, `run-${i + 1}.json`);
        await fs.writeFile(logPath, JSON.stringify(log, null, 2) + "\n");
      }
    }
  }

  const metaPath = path.join(outputRoot, runStamp, "run.meta.json");
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        runId,
        createdAt: new Date().toISOString(),
        modes: modes.map((m) => m.name),
        tasks: tasks.map((t) => t.id),
        provider: config.provider,
        runsPerTask: config.runsPerTask,
        type: "combined",
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Combined runs completed. Output: ${outputRoot}/${runStamp}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
