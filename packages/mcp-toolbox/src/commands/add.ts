import { Command } from "commander";
import path from "node:path";
import { isCancel, select, text, confirm, outro } from "@clack/prompts";
import {
  defaultConfigPath,
  loadToolboxConfig,
  fileExists,
} from "mcp-toolbox-runtime";
import { writeToolboxConfigJson } from "../lib/writeConfig.js";
import type { ToolboxServerConfig } from "mcp-toolbox-runtime";

export function addCommand() {
  const cmd = new Command("add")
    .description("Add an MCP server to mcp-toolbox.config.json")
    .option("--config <path>", "Path to config file", defaultConfigPath())
    .option("--yes", "Run non-interactively", false)
    .action(async (opts) => {
      const configPath: string = opts.config;
      const nonInteractive: boolean = Boolean(opts.yes);

      if (!(await fileExists(configPath))) {
        throw new Error(
          `Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`
        );
      }

      const config = await loadToolboxConfig(configPath);

      let serverName: string | undefined;
      let transportType: "stdio" | "http" | undefined;
      let command: string | undefined;
      let args: string[] | undefined;
      let env: Record<string, string> | undefined;
      let url: string | undefined;

      if (nonInteractive) {
        throw new Error(
          "Non-interactive mode not yet supported. Please run without --yes flag."
        );
      }

      // Prompt for server name
      const nameInput = await text({
        message: "Server name (unique identifier):",
        placeholder: "my-server",
        validate(value) {
          if (!value || value.trim().length === 0) {
            return "Server name is required";
          }
        },
      });
      if (isCancel(nameInput)) return;
      serverName = String(nameInput).trim();

      // Check if server already exists
      if (config.servers.some((s) => s.name === serverName)) {
        const overwrite = await confirm({
          message: `Server '${serverName}' already exists. Overwrite?`,
          initialValue: false,
        });
        if (isCancel(overwrite) || !overwrite) return;
        // Remove existing server
        config.servers = config.servers.filter((s) => s.name !== serverName);
      }

      // Prompt for transport type
      const transportInput = await select({
        message: "Transport type:",
        options: [
          {
            value: "stdio",
            label: "stdio - Run a command (e.g., npx mcp-remote)",
          },
          { value: "http", label: "http - Connect to HTTP endpoint" },
        ],
      });
      if (isCancel(transportInput)) return;
      transportType = transportInput as "stdio" | "http";

      if (transportType === "stdio") {
        // Prompt for command
        const commandInput = await text({
          message: "Command:",
          placeholder: "npx",
          validate(value) {
            if (!value || value.trim().length === 0) {
              return "Command is required for stdio transport";
            }
          },
        });
        if (isCancel(commandInput)) return;
        command = String(commandInput).trim();

        // Prompt for args
        const argsInput = await text({
          message: "Arguments (space-separated, optional):",
          placeholder: "mcp-remote https://example.com/mcp",
        });
        if (!isCancel(argsInput) && argsInput) {
          args = String(argsInput)
            .trim()
            .split(/\s+/)
            .filter((a) => a.length > 0);
        }

        // Prompt for env vars (optional)
        const envInput = await text({
          message:
            "Environment variables (key=value, space-separated, optional):",
          placeholder: "API_KEY=secret WORKSPACE_ROOT=/path",
          validate(value) {
            if (value && value.trim().length > 0) {
              const envPairs = value
                .trim()
                .split(/\s+/)
                .filter((e) => e.length > 0);
              for (const pair of envPairs) {
                if (!pair.includes("=")) {
                  return `Invalid format: "${pair}". Expected key=value format`;
                }
                const [key] = pair.split("=");
                if (!key || key.trim().length === 0) {
                  return `Invalid format: "${pair}". Key cannot be empty`;
                }
              }
            }
          },
        });
        if (!isCancel(envInput) && envInput) {
          const envPairs = String(envInput)
            .trim()
            .split(/\s+/)
            .filter((e) => e.length > 0);
          env = {};
          for (const pair of envPairs) {
            const [key, ...valueParts] = pair.split("=");
            if (key && valueParts.length > 0) {
              env[key] = valueParts.join("=");
            }
          }
        }
      } else {
        // Prompt for URL
        const urlInput = await text({
          message: "HTTP URL:",
          placeholder: "https://api.example.com/mcp",
          validate(value) {
            if (!value || value.trim().length === 0) {
              return "URL is required for http transport";
            }
            try {
              new URL(value.trim());
            } catch {
              return "Invalid URL format";
            }
          },
        });
        if (isCancel(urlInput)) return;
        url = String(urlInput).trim();
      }

      // Create server config
      const serverConfig: ToolboxServerConfig = {
        name: serverName!,
        transport:
          transportType === "stdio"
            ? {
                type: "stdio",
                command: command!,
                ...(args && args.length > 0 ? { args } : {}),
                ...(env && Object.keys(env).length > 0 ? { env } : {}),
              }
            : {
                type: "http",
                url: url!,
              },
      };

      config.servers.push(serverConfig);
      await writeToolboxConfigJson(configPath, config);
      const resolvedPath = path.resolve(configPath);
      outro(`Added server '${serverName}' to ${resolvedPath}`);
    });

  return cmd;
}
