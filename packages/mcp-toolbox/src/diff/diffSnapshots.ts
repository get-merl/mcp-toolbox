import type { DiffSummary } from "./types";
import { stableStringify } from "../snapshot/normalize";
import type { IntrospectedServer, McpToolDefinition } from "../introspect/types";

export function diffSnapshots(oldSnap: IntrospectedServer, newSnap: IntrospectedServer): DiffSummary {
  const oldTools = indexTools(oldSnap.tools);
  const newTools = indexTools(newSnap.tools);

  const changes: DiffSummary["changes"] = [];
  let breaking = false;

  for (const [toolName] of oldTools) {
    if (!newTools.has(toolName)) {
      changes.push({ kind: "tool_removed", toolName });
      breaking = true;
    }
  }

  for (const [toolName] of newTools) {
    if (!oldTools.has(toolName)) {
      changes.push({ kind: "tool_added", toolName });
    }
  }

  for (const [toolName, oldTool] of oldTools) {
    const newTool = newTools.get(toolName);
    if (!newTool) continue;

    const fields: string[] = [];

    if ((oldTool.description ?? "") !== (newTool.description ?? "")) {
      changes.push({ kind: "tool_description_changed", toolName });
    }

    // Strict schema compare for MVP: any inputSchema change is breaking-ish.
    if (stableStringify(oldTool.inputSchema) !== stableStringify(newTool.inputSchema)) {
      fields.push("inputSchema");
      breaking = true;
    }

    if (fields.length) {
      changes.push({ kind: "tool_changed", toolName, fields });
    }
  }

  // If we didn't detect changes, breaking should be false.
  return { breaking, changes };
}

function indexTools(tools: McpToolDefinition[]) {
  const m = new Map<string, McpToolDefinition>();
  for (const t of tools) m.set(t.name, t);
  return m;
}

