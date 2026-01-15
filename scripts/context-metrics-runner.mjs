import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_CONFIG = "scripts/context-metrics/config.json";

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
  return Buffer.byteLength(value, "utf-8");
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalizeValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalizeValue(value));
}

function matchesExpectedToolCall(parsed, expected) {
  if (!parsed || !expected) return false;
  if (parsed.tool_name !== expected.tool_name) return false;
  const parsedArgs = parsed.arguments || {};
  const expectedArgs = expected.arguments || {};
  return stableStringify(parsedArgs) === stableStringify(expectedArgs);
}

async function callAnthropic({ apiKey, model, system, user }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json?.error?.message || "Anthropic request failed");
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  const text = (json.content || [])
    .map((part) => (part?.type === "text" ? part.text : ""))
    .join("");

  return {
    text,
    usage: {
      input_tokens: json.usage?.input_tokens ?? null,
      output_tokens: json.usage?.output_tokens ?? null,
    },
    raw: json,
  };
}

function resolveOpenAIMaxParam(provider, model) {
  if (provider?.maxTokensParam === "max_completion_tokens") return "max_completion_tokens";
  if (provider?.maxTokensParam === "max_tokens") return "max_tokens";
  if (typeof model === "string" && model.startsWith("gpt-5")) return "max_completion_tokens";
  return "max_tokens";
}

async function callOpenAI({ apiKey, model, system, user, provider }) {
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
      [maxParam]: 300,
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

  if (mode.toolDefinitionScope === "allServers") {
    const serverSlugs = await listSnapshotServers(snapshotsDir);
    const all = [];
    for (const slug of serverSlugs) {
      const tools = await loadSnapshotTools({ snapshotsDir, serverSlug: slug });
      all.push(...tools.map((tool) => ({ ...tool, __serverSlug: slug })));
    }
    return all;
  }

  if (mode.toolDefinitionScope === "scaled") {
    const targetCount = mode.toolCount || 100;
    const realTools = await loadSnapshotTools({
      snapshotsDir,
      serverSlug: task.serverSlug,
    });
    const taskTools = realTools.filter((tool) => task.toolNames.includes(tool.name));
    const otherRealTools = realTools.filter((tool) => !task.toolNames.includes(tool.name));
    const syntheticTools = syntheticToolsPath ? await loadSyntheticTools(syntheticToolsPath) : [];
    const paddingPool = [...otherRealTools, ...syntheticTools];
    const paddingNeeded = Math.max(0, targetCount - taskTools.length);
    const padding = [];
    for (let i = 0; i < paddingNeeded && paddingPool.length > 0; i++) {
      padding.push(paddingPool[i % paddingPool.length]);
    }
    return [...taskTools, ...padding];
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
      // Clone the tool to avoid reference issues, and mark it with a unique index
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

async function run() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  const config = await readJson(configPath);

  await loadEnvFile(path.resolve(".env"));

  const tasksPath = path.resolve(config.tasksFile);
  const tasks = await readJson(tasksPath);
  const snapshotsDir = path.resolve(config.snapshotsDir);
  const outputRoot = path.resolve(config.outputDir);
  const syntheticToolsPath = config.syntheticToolsFile
    ? path.resolve(config.syntheticToolsFile)
    : null;
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

        const promptBytes = toBytes(prompt.system) + toBytes(prompt.user);
        const toolDefsBytes = toBytes(toolText);
        const toolDefsCount = tools.length;

        const start = Date.now();
        let result;
        try {
          if (provider.kind === "anthropic") {
            result = await callAnthropic({
              apiKey,
              model: provider.model,
              system: prompt.system,
              user: prompt.user,
            });
          } else if (provider.kind === "openai") {
            result = await callOpenAI({
              apiKey,
              model: provider.model,
              system: prompt.system,
              user: prompt.user,
              provider,
            });
          } else {
            throw new Error(`Unsupported provider: ${provider.kind}`);
          }
        } catch (error) {
          const outDir = path.join(outputRoot, runStamp, mode.name, task.id);
          await fs.mkdir(outDir, { recursive: true });
          const logPath = path.join(outDir, `run-${i + 1}.json`);
          await fs.writeFile(
            logPath,
            JSON.stringify(
              {
                runId,
                mode: mode.name,
                taskId: task.id,
                provider: provider.kind,
                model: provider.model,
                error: {
                  message: error.message,
                  status: error.status || null,
                  payload: error.payload || null,
                },
              },
              null,
              2,
            ) + "\n",
          );
          continue;
        }
        const latencyMs = Date.now() - start;
        const usage = result.usage || {};
        const responseText = result.text || "";
        const parsed = extractJson(responseText);
        const expected = task.expectedToolCall || null;
        const matchesExpected = matchesExpectedToolCall(parsed, expected);

        const estimatedCost = estimateCost(config.pricing, usage);

        const log = {
          runId,
          mode: mode.name,
          taskId: task.id,
          provider: provider.kind,
          model: provider.model,
          tool_definition_scope: mode.toolDefinitionScope,
          tool_definitions_count: toolDefsCount,
          tool_definitions_bytes: toolDefsBytes,
          prompt_bytes: promptBytes,
          prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
          completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
          total_tokens:
            usage.total_tokens ??
            (usage.prompt_tokens ?? usage.input_tokens ?? 0) +
              (usage.completion_tokens ?? usage.output_tokens ?? 0),
          latency_ms: latencyMs,
          response_bytes: toBytes(responseText),
          estimated_cost_usd: estimatedCost,
          success: Boolean(matchesExpected),
          response_text: responseText,
          parsed_tool_call: parsed,
          expected_tool_call: expected,
        };

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
      },
      null,
      2,
    ) + "\n",
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
