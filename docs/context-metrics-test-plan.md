## Context Metrics Test Plan

### Goal

Measure and compare context usage and efficiency across LLM sessions that:

- **Baseline**: include full MCP tool definitions from servers (direct MCP usage).
- **Toolbox**: include only the minimal tool definitions needed for each task (mcp-toolbox usage).

### Key Metrics

- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `prompt_bytes`, `tool_definitions_bytes`
- `latency_ms` (request start to response end)
- `estimated_cost_usd` (if pricing configured)
- `success_rate` (expected tool call matched)
- `error_rate` (API errors, parse errors)
- `tool_definitions_count`
- `response_bytes`

Optional additions:

- `time_to_first_token_ms` (requires streaming)
- `token_per_second` (requires streaming)

### Prerequisites

- Node 20+
- API key for provider (e.g. `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) in `.env` or exported in your shell
- Tool snapshots from MCP servers:

```bash
pnpm mcp-toolbox introspect --config mcp-toolbox.config.json --outDir toolbox
```

Snapshots are stored under `toolbox/.snapshots/<server>/latest.json`.

### Experiment Design

- Use the same tasks, prompts, model, and temperature in both modes.
- Run multiple repetitions per task (e.g. `runsPerTask: 5`).
- Compare distribution of metrics (min/median/max).

### Task Definition

Tasks are listed in `scripts/context-metrics/tasks.json` and include:

- `id`, `serverSlug`, `prompt`, `expectedToolCall`, `toolNames`

### Running the Tests

1. Copy and edit the config:
   - `scripts/context-metrics/config.example.json` -> `scripts/context-metrics/config.json`
   - For OpenAI `gpt-5*` models, the runner automatically uses `max_completion_tokens`
   - The runner enforces strict JSON-only tool call output
2. Run the baseline mode:

```bash
node scripts/context-metrics-runner.mjs --config scripts/context-metrics/config.json --mode baseline
```

3. Run the toolbox mode:

```bash
node scripts/context-metrics-runner.mjs --config scripts/context-metrics/config.json --mode toolbox
```

4. Aggregate results:

```bash
node scripts/context-metrics-aggregate.mjs --input context-metrics-runs
```

### Outputs

- Raw logs under `context-metrics-runs/<timestamp>/...`
- Summary files:
  - `context-metrics-runs/summary/summary.json`
  - `context-metrics-runs/summary/summary.csv`
  - `context-metrics-runs/summary/summary.md`
  - Summary now includes a delta table comparing toolbox vs baseline

### Log Schema (per run)

- `runId`, `mode`, `taskId`, `provider`, `model`
- `tool_definition_scope`, `tool_definitions_count`, `tool_definitions_bytes`
- `prompt_bytes`, `prompt_tokens`, `completion_tokens`, `total_tokens`
- `latency_ms`, `response_bytes`, `estimated_cost_usd`
- `success`, `parsed_tool_call`, `expected_tool_call`, `response_text`

### Interpreting Results

Expect **toolbox** runs to reduce:

- `tool_definitions_bytes` and `prompt_tokens`
- Total cost and latency

Validate that `success_rate` is stable between baseline and toolbox.

### Output Equivalence and Variance

- Each run is marked `success=true` only if the model’s tool call JSON matches `expected_tool_call` exactly.
- If success rates diverge, inspect `response_text` for prompt or tool-definition drift.
- Use multiple runs per task (N>=3) to account for nondeterminism.
