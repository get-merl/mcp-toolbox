import path from "node:path";

export function resolveOutDir(args: {
  configPath: string;
  outDirOverride?: string;
  configOutDir?: string;
}) {
  const configDir = path.dirname(path.resolve(args.configPath));
  const outDir = args.outDirOverride ?? args.configOutDir ?? "toolbox";
  return path.isAbsolute(outDir) ? outDir : path.resolve(configDir, outDir);
}
