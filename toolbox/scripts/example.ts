#!/usr/bin/env npx tsx
/**
 * Example custom script
 *
 * This is a template for creating custom workflows that combine
 * MCP tools with your own logic. Modify this file or create new
 * scripts in this folder.
 *
 * Usage: npx tsx toolbox/scripts/example.ts
 */

// Import tools from your MCP servers
// import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  console.log("🚀 Custom script starting...");

  // Example: List and process tables
  // const tables = await listTables({ schemas: ["public"] });
  // console.log(`Found ${tables.tables.length} tables`);

  // Example: Execute custom SQL
  // const result = await executeSql({ sql: "SELECT NOW()" });
  // console.log("Current time:", result.rows[0].now);

  console.log("✅ Script complete!");
}

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
