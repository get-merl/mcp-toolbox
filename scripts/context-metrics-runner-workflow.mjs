#!/usr/bin/env node
/**
 * Multi-turn workflow runner for context metrics tests.
 * This runner executes multi-step workflows and measures cumulative context growth.
 *
 * Usage:
 *   node scripts/context-metrics-runner-workflow.mjs --config scripts/context-metrics/config-workflow.json --mode baseline
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = "scripts/context-metrics/config-workflow.json";

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

async function buildToolSet({ mode, workflow, snapshotsDir }) {
  if (mode.toolDefinitionScope === "workflowToolsOnly") {
    const tools = await loadSnapshotTools({
      snapshotsDir,
      serverSlug: workflow.serverSlug,
    });
    return tools.filter((tool) => workflow.toolNames.includes(tool.name));
  }

  if (mode.toolDefinitionScope === "serverOnly") {
    return await loadSnapshotTools({
      snapshotsDir,
      serverSlug: workflow.serverSlug,
    });
  }

  if (mode.toolDefinitionScope === "allServers") {
    const serverSlugs = await listSnapshotServers(snapshotsDir);
    const all = [];
    for (const slug of serverSlugs) {
      const tools = await loadSnapshotTools({ snapshotsDir, serverSlug: slug });
      all.push(...tools.map((tool) => ({ ...tool, __serverSlug: slug })));
    }
    return all;
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

/**
 * Convert tool name from "server.tool_name" format to parts
 */
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
  const resultObj = typeof result === "string" ? JSON.parse(result) : result;

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

/**
 * Calculate total bytes of all messages in conversation
 */
function calculateConversationBytes(messages) {
  return messages.reduce((sum, msg) => sum + toBytes(msg.content), 0);
}

async function run() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  const config = await readJson(configPath);

  await loadEnvFile(path.resolve(".env"));

  const workflowsPath = path.resolve(config.workflowsFile);
  const workflows = await readJson(workflowsPath);
  const snapshotsDir = path.resolve(config.snapshotsDir);
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
    for (const workflow of workflows) {
      for (let runNum = 0; runNum < config.runsPerWorkflow; runNum += 1) {
        const log = {
          runId,
          mode: mode.name,
          workflowId: workflow.id,
          provider: provider.kind,
          model: provider.model,
          tool_definition_scope: mode.toolDefinitionScope,
          steps: [],
          context_tokens_per_turn: [],
          cumulative_result_bytes: 0,
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_tokens: 0,
          estimated_cost_usd: 0,
          success: false,
          completed_steps: 0,
          total_steps: workflow.steps.length,
          error: null,
        };

        try {
          // Build tool definitions
          const tools = await buildToolSet({ mode, workflow, snapshotsDir });
          const toolText = tools
            .map((tool) =>
              buildToolDefinitionsText({
                tools: [tool],
                serverSlug: resolveServerSlug(tool, workflow.serverSlug),
              }),
            )
            .join("\n");

          // Initialize conversation
          const systemPrompt = `${config.prompt.system}\n\n${STRICT_OUTPUT_INSTRUCTIONS}\n\nTOOLS:\n${toolText}\n\nTool name format: <serverSlug>.<toolName>`;

          const messages = [{ role: "system", content: systemPrompt }];

          // Execute each step
          for (let stepIdx = 0; stepIdx < workflow.steps.length; stepIdx++) {
            const step = workflow.steps[stepIdx];
            const stepLog = {
              stepIndex: stepIdx,
              prompt: step.prompt,
              expectedTool: step.expectedTool,
            };

            // Add user message for this step
            const userContent = step.expectedTool
              ? `${step.prompt}\n${STRICT_OUTPUT_INSTRUCTIONS}`
              : step.prompt;

            messages.push({ role: "user", content: userContent });

            // Track context size before this turn
            const contextBytesBeforeTurn = calculateConversationBytes(messages);
            stepLog.context_bytes_before_turn = contextBytesBeforeTurn;

            // Get model response
            const turnStart = Date.now();
            const turnResult = await callOpenAIWithMessages({
              apiKey,
              model: provider.model,
              messages,
              provider,
              maxTokens: step.expectedTool ? 300 : 1000,
            });
            const turnLatency = Date.now() - turnStart;

            stepLog.prompt_tokens = turnResult.usage.prompt_tokens;
            stepLog.completion_tokens = turnResult.usage.completion_tokens;
            stepLog.total_tokens = turnResult.usage.total_tokens;
            stepLog.latency_ms = turnLatency;
            stepLog.response = turnResult.text;

            log.total_prompt_tokens += turnResult.usage.prompt_tokens || 0;
            log.total_completion_tokens += turnResult.usage.completion_tokens || 0;
            log.total_tokens += turnResult.usage.total_tokens || 0;
            log.context_tokens_per_turn.push(turnResult.usage.prompt_tokens || 0);

            messages.push({ role: "assistant", content: turnResult.text });

            // If this step expects a tool call, execute it
            if (step.expectedTool) {
              const parsedToolCall = extractJson(turnResult.text);
              stepLog.parsed_tool_call = parsedToolCall;

              if (parsedToolCall && parsedToolCall.tool_name) {
                const { serverSlug, fileName } = parseToolName(parsedToolCall.tool_name);

                const execStart = Date.now();
                let toolResult;
                try {
                  toolResult = await executeMcpTool({
                    serverSlug,
                    toolName: fileName,
                    args: parsedToolCall.arguments || {},
                    toolboxDir,
                  });
                  stepLog.tool_execution_success = true;
                } catch (execError) {
                  stepLog.tool_execution_success = false;
                  stepLog.tool_execution_error = execError.message;
                  // Use error as result to continue workflow
                  toolResult = { error: execError.message };
                }
                stepLog.tool_execution_latency_ms = Date.now() - execStart;

                const rawResultBytes = toBytes(toolResult);
                stepLog.result_bytes_raw = rawResultBytes;
                log.cumulative_result_bytes += rawResultBytes;

                // Filter result for toolbox mode
                let filteredResult = toolResult;
                if (mode.filterResult && step.filterConfig) {
                  filteredResult = filterResult(toolResult, step.filterConfig);
                }
                const filteredResultBytes = toBytes(filteredResult);
                stepLog.result_bytes_filtered = filteredResultBytes;
                stepLog.filter_applied = mode.filterResult && step.filterConfig ? step.filterConfig.type : null;

                // Add result to conversation
                const resultToSend = mode.filterResult ? filteredResult : toolResult;
                const resultStr =
                  typeof resultToSend === "string"
                    ? resultToSend
                    : JSON.stringify(resultToSend, null, 2);

                messages.push({
                  role: "user",
                  content: `Tool result:\n${resultStr}`,
                });

                stepLog.result_bytes_in_context = toBytes(resultStr);
              } else {
                stepLog.tool_call_parse_error = "Could not parse tool call from response";
              }
            }

            // Track context size after this turn
            stepLog.context_bytes_after_turn = calculateConversationBytes(messages);

            log.steps.push(stepLog);
            log.completed_steps = stepIdx + 1;
          }

          log.success = true;
          log.estimated_cost_usd = estimateCost(config.pricing, {
            prompt_tokens: log.total_prompt_tokens,
            completion_tokens: log.total_completion_tokens,
          });

          // Calculate context growth rate
          if (log.context_tokens_per_turn.length > 1) {
            const first = log.context_tokens_per_turn[0];
            const last = log.context_tokens_per_turn[log.context_tokens_per_turn.length - 1];
            log.context_growth_factor = Number((last / first).toFixed(2));
          }
        } catch (error) {
          log.error = {
            message: error.message,
            stack: error.stack,
          };
        }

        // Write log
        const outDir = path.join(outputRoot, runStamp, mode.name, workflow.id);
        await fs.mkdir(outDir, { recursive: true });
        const logPath = path.join(outDir, `run-${runNum + 1}.json`);
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
        workflows: workflows.map((w) => w.id),
        provider: config.provider,
        runsPerWorkflow: config.runsPerWorkflow,
        type: "workflow",
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Workflow runs completed. Output: ${outputRoot}/${runStamp}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
