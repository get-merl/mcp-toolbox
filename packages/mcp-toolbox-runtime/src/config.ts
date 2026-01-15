import { z } from "zod";

const stdioTransportSchema = z
  .object({
    type: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const httpTransportSchema = z
  .object({
    type: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.headers && Object.keys(value.headers).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headers"],
        message:
          "HTTP headers are not supported by the current HTTP transport. Remove headers or use stdio.",
      });
    }
  })
  .strict();

export const toolboxServerConfigSchema = z
  .object({
    name: z.string().min(1), // Required: unique identifier for this server
    transport: z.union([stdioTransportSchema, httpTransportSchema]),
  })
  .strict();

const generationSchema = z
  .object({
    outDir: z.string().min(1),
    language: z.literal("ts"),
  })
  .strict();

const securitySchema = z
  .object({
    allowStdioExec: z.boolean(),
    envAllowlist: z.array(z.string().min(1)),
  })
  .strict();

const cliSchema = z
  .object({
    interactive: z.boolean().optional(),
  })
  .strict();

const clientSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
  })
  .strict();

export const toolboxConfigSchema = z
  .object({
    servers: z.array(toolboxServerConfigSchema),
    generation: generationSchema,
    security: securitySchema,
    cli: cliSchema.optional(),
    client: clientSchema.optional(),
  })
  .strict();

export type ToolboxServerConfig = z.infer<typeof toolboxServerConfigSchema>;
export type ToolboxConfig = z.infer<typeof toolboxConfigSchema>;
