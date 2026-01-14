import crypto from "node:crypto";
import { stableStringify } from "./normalize";

export function fingerprint(value: unknown): string {
  const normalized = stableStringify(value);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

