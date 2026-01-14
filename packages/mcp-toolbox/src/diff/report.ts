import type { DiffSummary } from "./types";

export function renderDiffReport(args: {
  registryId: string;
  oldVersion?: string;
  newVersion?: string;
  diff: DiffSummary;
}) {
  const lines: string[] = [];
  lines.push(`# MCP Toolbox Diff Report`);
  lines.push("");
  lines.push(`- server: \`${args.registryId}\``);
  if (args.oldVersion) lines.push(`- from: \`${args.oldVersion}\``);
  if (args.newVersion) lines.push(`- to: \`${args.newVersion}\``);
  lines.push(`- breaking: **${args.diff.breaking ? "yes" : "no"}**`);
  lines.push("");

  if (args.diff.changes.length === 0) {
    lines.push("No changes detected.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Changes");
  lines.push("");
  for (const c of args.diff.changes) {
    if (c.kind === "tool_added") lines.push(`- added tool \`${c.toolName}\``);
    if (c.kind === "tool_removed") lines.push(`- removed tool \`${c.toolName}\``);
    if (c.kind === "tool_description_changed")
      lines.push(`- description changed for \`${c.toolName}\``);
    if (c.kind === "tool_changed")
      lines.push(`- schema changed for \`${c.toolName}\`: ${c.fields.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

