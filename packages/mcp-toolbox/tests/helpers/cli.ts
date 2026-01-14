import { spawn } from "node:child_process";
import path from "node:path";
import type { ExecResult } from "./types";

export async function runCli(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    input?: string;
  } = {}
): Promise<ExecResult> {
  const binPath = path.join(process.cwd(), "dist", "bin.js");
  const timeout = options.timeout ?? 30000;

  return new Promise((resolve, reject) => {
    const child = spawn("node", [binPath, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }

    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI execution timed out after ${timeout}ms`));
    }, timeout);

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? 0,
        signal: signal ?? null,
        stdout,
        stderr,
      });
    });
  });
}

export function mockPrompts(responses: Record<string, string | boolean>): void {
  // This would need to be implemented by mocking @clack/prompts
  // For now, we'll use --yes flag for non-interactive mode
}
