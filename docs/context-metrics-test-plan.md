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

---

## Advanced Test Types

### 1. Scaling Tests

Test how context usage grows with tool count across a wide range (30 to 20,000 tools).

**Config**: `scripts/context-metrics/config-scaling.json`

**Run**:

```bash
node scripts/context-metrics-runner.mjs --config scripts/context-metrics/config-scaling.json
node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-scaling --type scaling
```

**Modes**:

- `toolbox`: Uses `taskToolsOnly` scope - only the minimal tools needed for each task (constant regardless of scale)
- `baseline-30/50/100/150/200/500/1000/2000/5000/10000/20000`: Uses `scaledBaseline` scope - includes ALL server tools up to the target count (linear growth with tool count). Tools are cycled if target count exceeds available tools.

**Key metrics**:

- `tool_definitions_bytes` vs tool count
- `total_tokens` vs tool count
- **Expected**: Linear growth in baseline modes; constant in toolbox mode
- **Comparison**: Shows savings from toolbox approach at different scales

### 2. Execution Tests (Large Result Filtering)

Test context savings from filtering large tool results before returning to model.

**Config**: `scripts/context-metrics/config-exec.json`

**Tasks**: `scripts/context-metrics/exec-tasks.json`

**Run**:

```bash
node scripts/context-metrics-runner-exec.mjs --config scripts/context-metrics/config-exec.json --mode baseline
node scripts/context-metrics-runner-exec.mjs --config scripts/context-metrics/config-exec.json --mode toolbox
node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-exec --type exec
```

**Key metrics**:

- `result_bytes_raw` - size of unfiltered tool result
- `result_bytes_filtered` - size after filtering (toolbox only)
- `total_tokens` - includes result in context

**Filter types**:

- `truncate` - limit result to N characters
- `summarize_array` - return count + sample
- `extract_fields` - return only specified fields

### 4. Combined Tests (Scaling + Result Filtering)

Test both tool definition overhead and result filtering benefits simultaneously at different scales.

**Config**: `scripts/context-metrics/config-combined.json`

**Tasks**: `scripts/context-metrics/combined-tasks.json`

**Run**:

```bash
node scripts/context-metrics-runner-combined.mjs --config scripts/context-metrics/config-combined.json --mode baseline-100
node scripts/context-metrics-runner-combined.mjs --config scripts/context-metrics/config-combined.json --mode toolbox
node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-combined --type combined
```

**Modes**:

- `toolbox`: Uses `taskToolsOnly` scope + filters results (both benefits)
- `baseline-30/50/100/200/500`: Uses `scaledBaseline` scope + no filtering (all tools, unfiltered results)

**Key metrics**:

- `tool_definitions_bytes` - measures progressive disclosure benefit
- `result_bytes_raw` vs `result_bytes_filtered` - measures filtering benefit
- `result_bytes_in_context` - actual bytes sent to model (combines both benefits)
- `total_tokens` - final context usage including both tool definitions and results

**Purpose**:

- Validates both Anthropic claims simultaneously:
  - **Progressive Disclosure**: Tool definition overhead at scale
  - **Context Efficient Tool Results**: Result filtering benefits
- Shows combined savings when both optimizations are applied
- Demonstrates real-world scenario where agents work with many tools and large results

### 3. Workflow Tests (Multi-Turn Context Growth)

Test cumulative context growth across multi-step agent workflows.

**Config**: `scripts/context-metrics/config-workflow.json`

**Workflows**: `scripts/context-metrics/workflows.json`

**Run**:

```bash
node scripts/context-metrics-runner-workflow.mjs --config scripts/context-metrics/config-workflow.json --mode baseline
node scripts/context-metrics-runner-workflow.mjs --config scripts/context-metrics/config-workflow.json --mode toolbox
node scripts/context-metrics-aggregate-advanced.mjs --input context-metrics-runs-workflow --type workflow
```

**Key metrics**:

- `context_tokens_per_turn` - array of token counts at each step
- `cumulative_result_bytes` - total result bytes through workflow
- `context_growth_factor` - ratio of final to initial context size

**Expected outcomes**:

- Baseline: context grows significantly each turn as full results accumulate
- Toolbox: context grows slowly as filtered results are smaller

---

## Synthetic Tools

For scaling tests, synthetic tool definitions are generated in `scripts/context-metrics/synthetic-tools.json`.

These include mock tools for: CRM, Analytics, Storage, Email, Payments, Notifications, and Search.

Total: 70 synthetic tools + 30 real tools = 100+ tools for scaling tests.
