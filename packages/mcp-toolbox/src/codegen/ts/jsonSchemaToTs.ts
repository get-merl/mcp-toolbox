import { compile } from "json-schema-to-typescript";

/**
 * Convert a JSON Schema to a TypeScript type string.
 * Falls back to 'unknown' for schemas that can't be converted.
 */
export async function jsonSchemaToTsType(schema: unknown): Promise<string> {
  if (!schema || typeof schema !== "object") return "unknown";

  try {
    // Use compile but extract just the type (not the full interface declaration)
    const result = await compile(schema as any, "Temp", {
      bannerComment: "",
      additionalProperties: false,
      declareExternallyReferenced: false,
      enableConstEnums: true,
    });
    // Extract the type from the result (crude but works for simple cases)
    const match = result.match(/export (?:type|interface) Temp\s*=?\s*({[\s\S]*}|[^{;]+)/);
    if (match && match[1]) {
      return match[1].trim().replace(/;$/, "");
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Convert a JSON Schema to a TypeScript interface or type alias.
 * Uses json-schema-to-typescript for robust conversion of complex schemas
 * including anyOf, oneOf, $ref, enums, and nested objects.
 */
export async function jsonSchemaToTsInterface(
  name: string,
  schema: unknown
): Promise<string> {
  if (!schema || typeof schema !== "object") {
    return `export type ${name} = unknown;\n`;
  }

  try {
    const result = await compile(schema as any, name, {
      bannerComment: "",
      additionalProperties: false,
      declareExternallyReferenced: false,
      enableConstEnums: true,
      unknownAny: true,
    });
    return result;
  } catch {
    // Fallback for malformed schemas
    return `export type ${name} = unknown;\n`;
  }
}

/**
 * Synchronous fallback for simple schemas (used when async is not needed).
 * Only handles basic types - use jsonSchemaToTsInterface for full support.
 */
export function jsonSchemaToTsTypeSync(schema: any): string {
  if (!schema || typeof schema !== "object") return "unknown";

  const t = schema.type;
  if (t === "string") return "string";
  if (t === "number" || t === "integer") return "number";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  if (t === "array") {
    return `${jsonSchemaToTsTypeSync(schema.items)}[]`;
  }
  if (t === "object" || schema.properties) {
    return "Record<string, unknown>";
  }

  // anyOf/oneOf fallback
  if (Array.isArray(schema.anyOf)) return "unknown";
  if (Array.isArray(schema.oneOf)) return "unknown";
  return "unknown";
}
