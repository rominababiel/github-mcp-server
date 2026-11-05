import { z } from "zod";
import { fromZodError, toAppError } from "../errors/index.js";
import { logger } from "../utils/logging.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
  annotations: { readOnlyHint: boolean };
  run: (rawArguments: unknown) => Promise<ToolResult>;
}

interface ToolDefinition<Schema extends z.ZodType, Output> {
  name: string;
  description: string;
  schema: Schema;
  readOnly: boolean;
  execute: (input: z.output<Schema>) => Promise<Output>;
}

function toInputSchema(schema: z.ZodType): Tool["inputSchema"] {
  // io "input" evita marcar como requeridos los campos con default; $schema se quita porque algunos hosts lo rechazan.
  const jsonSchema = z.toJSONSchema(schema, { io: "input" });
  delete jsonSchema.$schema;
  return { ...jsonSchema, type: "object" };
}

export function defineTool<Schema extends z.ZodType, Output>(definition: ToolDefinition<Schema, Output>): Tool {
  const { name, description, schema, readOnly, execute } = definition;

  return {
    name,
    description,
    inputSchema: toInputSchema(schema),
    annotations: { readOnlyHint: readOnly },
    run: async (rawArguments) => {
      const startedAt = Date.now();
      try {
        const parsed = schema.safeParse(rawArguments ?? {});
        if (!parsed.success) {
          throw fromZodError(parsed.error);
        }
        const output = await execute(parsed.data);
        logger.info("Tool ejecutado", { tool: name, durationMs: Date.now() - startedAt });
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        const appError = toAppError(error);
        logger.error("Tool fallido", {
          tool: name,
          code: appError.code,
          detail: appError.cause instanceof Error ? appError.cause.message : undefined,
          durationMs: Date.now() - startedAt,
        });
        return { content: [{ type: "text", text: appError.message }], isError: true };
      }
    },
  };
}
