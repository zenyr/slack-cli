import { COMMANDS } from "@zenyr/slack-cli-config";

import { createError } from "../errors";
import { type CommandSchema, toCommandSchemas } from "../schema";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_SCHEMAS = toCommandSchemas(COMMANDS);

const enabledCapabilities = (schema: CommandSchema): string[] => {
  const capabilities: string[] = [];
  if (schema.supportsJsonOutput) capabilities.push("json");
  if (schema.supportsStdin) capabilities.push("stdin");
  if (schema.supportsRawPayload) capabilities.push("payload");
  if (schema.supportsDryRun) capabilities.push("dry-run");
  if (schema.requiresConfirmation) capabilities.push("confirm");
  return capabilities;
};

const renderSchemaLines = (schemas: CommandSchema[], exact: boolean): string[] => {
  if (!exact) {
    return schemas.map((schema) => `- ${schema.name}: ${schema.description}`);
  }

  const schema = schemas[0];
  if (schema === undefined) return [];

  const lines = [
    `command: ${schema.name}`,
    `usage: slack ${schema.name}${schema.args.length > 0 ? ` ${schema.args}` : ""}`,
    `about: ${schema.description}`,
  ];

  if (schema.mutating) lines.push("effect: mutate");
  for (const effect of schema.conditionalSideEffects) {
    lines.push(`effect-if: ${effect.when} -> ${effect.kind}`);
  }

  const capabilities = enabledCapabilities(schema);
  if (capabilities.length > 0) lines.push(`io: [${capabilities.join(", ")}]`);

  const allowed = schema.tokenPolicy.allowed?.join(", ");
  if (schema.tokenPolicy.mode !== "default") {
    lines.push(
      allowed === undefined
        ? `auth: ${schema.tokenPolicy.mode}`
        : `auth: ${schema.tokenPolicy.mode}[${allowed}]`,
    );
  }

  if (schema.mcpTools !== undefined) lines.push(`mcp: [${schema.mcpTools.join(", ")}]`);
  if (schema.examples !== undefined) {
    lines.push("examples:", ...schema.examples.map((example) => `  - ${example}`));
  }

  return lines;
};

export const schemaHandler = (request: CommandRequest): CliResult => {
  const targetName = request.positionals.join(" ").trim();
  const exactSchema = COMMAND_SCHEMAS.find((schema) => schema.name === targetName);
  const schemas =
    targetName.length === 0
      ? COMMAND_SCHEMAS
      : exactSchema === undefined
        ? COMMAND_SCHEMAS.filter((schema) => schema.path[0] === targetName)
        : [exactSchema];

  if (targetName.length > 0 && schemas.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `Unknown command schema target: ${targetName}`,
      "Run 'slack --help' for namespaces, then 'slack <namespace> --help' for operations.",
      "schema",
    );
  }

  const exact = exactSchema !== undefined;
  return {
    ok: true,
    command: "schema",
    message: exact
      ? `Schema for ${targetName}`
      : targetName.length === 0
        ? "Command schema index"
        : `Schema index for ${targetName}`,
    data: exact ? { command: targetName, schema: exactSchema } : { commands: schemas },
    textLines: renderSchemaLines(schemas, exact),
  };
};
