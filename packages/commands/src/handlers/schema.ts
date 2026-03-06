import { COMMANDS } from "@zenyr/slack-cli-config";

import { createError } from "../errors";
import type { CliResult, CommandRequest } from "../types";

type CommandSchema = {
  name: string;
  path: string[];
  args: string;
  description: string;
  mutating: boolean;
  supportsJsonOutput: boolean;
  supportsStdin: boolean;
  supportsRawPayload: boolean;
  supportsDryRun: boolean;
  requiresConfirmation: boolean;
  tokenPolicy:
    | {
        mode: "explicit" | "restricted" | "default";
        allowed?: ("xoxp" | "xoxb")[];
      }
    | undefined;
};

const MUTATING_VERBS = new Set([
  "login",
  "logout",
  "use",
  "join",
  "leave",
  "set",
  "clear",
  "create",
  "update",
  "post",
  "reply",
  "delete",
  "pin",
  "unpin",
  "add",
  "remove",
]);

const splitCommandName = (name: string): string[] => {
  return name
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
};

const inferMutating = (path: string[]): boolean => {
  return path.some((token) => MUTATING_VERBS.has(token));
};

const inferSupportsStdin = (args: string, description: string): boolean => {
  return args.includes("|->") || description.includes("stdin");
};

const EXPLICIT_TOKEN_COMMANDS = new Set([
  "messages post",
  "messages post-ephemeral",
  "messages reply",
  "reactions add",
  "reactions remove",
]);

const RESTRICTED_TOKEN_COMMANDS: Record<string, ("xoxp" | "xoxb")[]> = {
  "users status set": ["xoxp"],
  "users status clear": ["xoxp"],
  "messages search": ["xoxp"],
  "messages pin": ["xoxp"],
};

const toTokenPolicy = (name: string): CommandSchema["tokenPolicy"] => {
  if (EXPLICIT_TOKEN_COMMANDS.has(name)) {
    return {
      mode: "explicit",
      allowed: ["xoxp", "xoxb"],
    };
  }

  const restricted = RESTRICTED_TOKEN_COMMANDS[name];
  if (restricted !== undefined) {
    return {
      mode: "restricted",
      allowed: restricted,
    };
  }

  return {
    mode: "default",
  };
};

const toCommandSchema = (name: string, args: string, description: string): CommandSchema => {
  const path = splitCommandName(name);

  return {
    name,
    path,
    args,
    description,
    mutating: inferMutating(path),
    supportsJsonOutput: true,
    supportsStdin: inferSupportsStdin(args, description),
    supportsRawPayload: args.includes("--payload=<json|->"),
    supportsDryRun: args.includes("--dry-run[=<bool>]"),
    requiresConfirmation: args.includes("--yes"),
    tokenPolicy: toTokenPolicy(name),
  };
};

const COMMAND_SCHEMAS: CommandSchema[] = COMMANDS.map((command) => {
  return toCommandSchema(command.name, command.args, command.description);
});

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
