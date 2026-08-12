import type { CliCommand } from "@zenyr/slack-cli-config";

export type ConditionalSideEffect = {
  kind: "delegated-command" | "filesystem-write";
  when: string;
  description: string;
};

export type CommandSchema = {
  name: string;
  path: string[];
  args: string;
  description: string;
  mutating: boolean;
  conditionalSideEffects: ConditionalSideEffect[];
  supportsJsonOutput: boolean;
  supportsStdin: boolean;
  supportsRawPayload: boolean;
  supportsDryRun: boolean;
  requiresConfirmation: boolean;
  tokenPolicy: {
    mode: "explicit" | "restricted" | "default";
    allowed?: ("xoxp" | "xoxb")[];
  };
  examples?: string[];
  mcpTools?: string[];
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
  "publish",
  "reply",
  "delete",
  "pin",
  "unpin",
  "mark",
  "add",
  "remove",
]);

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
  "messages unreads": ["xoxp"],
  "messages mark": ["xoxp"],
  "messages pin": ["xoxp"],
};

const CONDITIONAL_SIDE_EFFECTS: Record<string, ConditionalSideEffect[]> = {
  "attachment get": [
    {
      kind: "filesystem-write",
      when: "--save resolves to true and attachment download succeeds",
      description:
        "Creates a restricted temporary directory and writes the downloaded attachment to a restricted file.",
    },
  ],
  batch: [
    {
      kind: "delegated-command",
      when: "one or more non-batch nested commands execute",
      description:
        "May perform every side effect of each nested command; nested batch commands are rejected.",
    },
  ],
};

const splitCommandName = (name: string): string[] => {
  return name
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
};

const inferMutating = (path: string[]): boolean => {
  return path.some((token) => token.split("-").some((part) => MUTATING_VERBS.has(part)));
};

const inferSupportsStdin = (args: string, description: string): boolean => {
  return args.includes("|->") || description.includes("stdin");
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

export const toCommandSchema = (command: CliCommand): CommandSchema => {
  const { name, args, description } = command;
  const path = splitCommandName(name);

  return {
    name,
    path,
    args,
    description,
    mutating: inferMutating(path),
    conditionalSideEffects: CONDITIONAL_SIDE_EFFECTS[name] ?? [],
    supportsJsonOutput: true,
    supportsStdin: inferSupportsStdin(args, description),
    supportsRawPayload: args.includes("--payload="),
    supportsDryRun: args.includes("--dry-run[=<bool>]"),
    requiresConfirmation: args.includes("--yes"),
    tokenPolicy: toTokenPolicy(name),
    ...(command.examples === undefined ? {} : { examples: command.examples }),
    ...(command.mcpTools === undefined ? {} : { mcpTools: command.mcpTools }),
  };
};

export const toCommandSchemas = (commands: CliCommand[]): CommandSchema[] => {
  return commands.map(toCommandSchema);
};
