import { COMMANDS } from "@zenyr/slack-cli-config";

import { createError } from "../errors";
import { type CommandSchema, toCommandSchemas } from "../schema";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_SCHEMAS = toCommandSchemas(COMMANDS);

const renderSchemaLines = (schemas: CommandSchema[]): string[] => {
  const lines: string[] = [];

  for (const schema of schemas) {
    lines.push(`- ${schema.name}`);
    lines.push(`  args: ${schema.args || "(none)"}`);
    lines.push(`  mutating: ${schema.mutating ? "yes" : "no"}`);
    lines.push(`  json: yes`);
    lines.push(`  stdin: ${schema.supportsStdin ? "yes" : "no"}`);
    lines.push(`  raw-payload: ${schema.supportsRawPayload ? "yes" : "no"}`);
    lines.push(`  dry-run: ${schema.supportsDryRun ? "yes" : "no"}`);
    lines.push(`  confirm: ${schema.requiresConfirmation ? "yes" : "no"}`);
    if (schema.tokenPolicy !== undefined) {
      const allowed = schema.tokenPolicy.allowed?.join(", ");
      lines.push(
        allowed === undefined
          ? `  token-policy: ${schema.tokenPolicy.mode}`
          : `  token-policy: ${schema.tokenPolicy.mode} (${allowed})`,
      );
    }
  }

  return lines;
};

export const schemaHandler = (request: CommandRequest): CliResult => {
  const targetName = request.positionals.join(" ").trim();
  const schemas =
    targetName.length === 0
      ? COMMAND_SCHEMAS
      : COMMAND_SCHEMAS.filter((schema) => schema.name === targetName);

  if (targetName.length > 0 && schemas.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `Unknown command schema target: ${targetName}`,
      "Run 'slack schema --json' to inspect available commands.",
      "schema",
    );
  }

  return {
    ok: true,
    command: "schema",
    message: targetName.length === 0 ? "Command schemas listed" : `Schema for ${targetName}`,
    data:
      targetName.length === 0
        ? {
            commands: COMMAND_SCHEMAS,
          }
        : {
            command: targetName,
            schema: schemas[0],
          },
    textLines: renderSchemaLines(schemas),
  };
};
