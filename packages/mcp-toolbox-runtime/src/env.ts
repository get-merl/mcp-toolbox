export function buildStdioEnv(args: {
  allowlist: string[];
  baseEnv: NodeJS.ProcessEnv;
  transportEnv?: Record<string, string>;
  overrides?: Record<string, string>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const allowlist = new Set(
    args.allowlist.map((key) => key.trim()).filter((key) => key.length > 0)
  );

  for (const key of allowlist) {
    const value = args.baseEnv[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  if (args.transportEnv) {
    for (const [key, value] of Object.entries(args.transportEnv)) {
      env[key] = value;
    }
  }

  if (args.overrides) {
    for (const [key, value] of Object.entries(args.overrides)) {
      env[key] = value;
    }
  }

  return env;
}
