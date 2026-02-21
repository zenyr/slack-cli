import { createError } from "./errors";
import { DEFAULT_IO, renderCliResult } from "./output";
import { parseArgv } from "./parse";
import { COMMAND_REGISTRY } from "./registry";
import { routeCli } from "./router";
import { resolveSlackTokenForType } from "./slack/token";
import type { CliIo } from "./types";

type RunCliOptions = {
  version?: string;
  io?: CliIo;
  /** Override stdin source for testing. Defaults to process.stdin. */
  readStdin?: () => Promise<string | undefined>;
};

const buildAuthTokenFlagHint = (tokens: string[], requestedType: "xoxp" | "xoxb"): string => {
  const subcommand = tokens[1];
  const loginExample = `slack auth login --type ${requestedType} --token <token>`;
  const useExample = `slack auth use ${requestedType}`;
  const targetCommandExample = `slack messages post <channel-id> <text> --${requestedType}`;

  if (subcommand === "login") {
    return `Did you mean '${loginExample}'? If token already exists, run '${useExample}'. Use --${requestedType} only on target commands, e.g. '${targetCommandExample}'.`;
  }

  if (subcommand === "use") {
    return `Did you mean '${useExample}'? Use --${requestedType} only on target commands, e.g. '${targetCommandExample}'.`;
  }

  return `Use '${loginExample}' to store token, '${useExample}' to switch active token, and --${requestedType} only on target commands, e.g. '${targetCommandExample}'.`;
};

const defaultReadStdin = async (): Promise<string | undefined> => {
  if (process.stdin.isTTY) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 0 ? text : undefined;
};

export const runCli = async (argv: string[], options: RunCliOptions = {}): Promise<number> => {
  const version = options.version ?? "0.0.0-dev";
  const io = options.io ?? DEFAULT_IO;
  const readStdin = options.readStdin ?? defaultReadStdin;
  let stdinLoaded = false;
  let stdinText: string | undefined;
  const readStdinOnce = async (): Promise<string | undefined> => {
    if (!stdinLoaded) {
      stdinText = await readStdin();
      stdinLoaded = true;
    }
    return stdinText;
  };
  const parsed = parseArgv(argv);

  // --xoxp and --xoxb are mutually exclusive
  if (parsed.flags.xoxp && parsed.flags.xoxb) {
    const result = createError(
      "INVALID_ARGUMENT",
      "Cannot use --xoxp and --xoxb together.",
      "Use --xoxp to force a user token, or --xoxb to force a bot token.",
    );
    return renderCliResult(result, parsed.flags.json, io);
  }

  if (
    (parsed.flags.xoxp || parsed.flags.xoxb) &&
    parsed.tokens[0] === "auth" &&
    !parsed.flags.help &&
    !parsed.flags.version
  ) {
    const requestedType = parsed.flags.xoxp ? "xoxp" : "xoxb";
    const command = parsed.tokens.slice(0, 2).join(".") || "auth";
    const result = createError(
      "INVALID_ARGUMENT",
      `'auth' commands do not accept --${requestedType}.`,
      buildAuthTokenFlagHint(parsed.tokens, requestedType),
      command,
    );
    return renderCliResult(result, parsed.flags.json, io);
  }

  // Resolve tokenTypeOverride: verify the requested type is actually available
  let tokenTypeOverride: "xoxp" | "xoxb" | undefined;
  if (!parsed.flags.help && !parsed.flags.version && (parsed.flags.xoxp || parsed.flags.xoxb)) {
    const requestedType = parsed.flags.xoxp ? "xoxp" : "xoxb";
    const resolved = await resolveSlackTokenForType(requestedType);
    if (resolved === undefined) {
      const label = requestedType === "xoxp" ? "user (xoxp)" : "bot (xoxb)";
      const envKey = requestedType === "xoxp" ? "SLACK_MCP_XOXP_TOKEN" : "SLACK_MCP_XOXB_TOKEN";
      const result = createError(
        "INVALID_ARGUMENT",
        `--${requestedType}: no ${label} token is configured.`,
        `Set ${envKey} or run 'slack auth login' with a ${label} token.`,
      );
      return renderCliResult(result, parsed.flags.json, io);
    }
    tokenTypeOverride = requestedType;
  }

  // When --blocks is a bare flag (true) and stdin is available, use stdin as the blocks text.
  if (parsed.options.blocks === true) {
    const blocksSourceText = await readStdinOnce();
    if (blocksSourceText !== undefined) {
      parsed.options.blocks = blocksSourceText;
    }
  }

  const runSubcommand = async (subArgv: string[]) => {
    return await routeCli(
      parseArgv(subArgv),
      {
        version,
        runSubcommand,
        tokenTypeOverride,
        readStdin: readStdinOnce,
      },
      COMMAND_REGISTRY,
    );
  };

  try {
    const result = await routeCli(
      parsed,
      {
        version,
        runSubcommand,
        tokenTypeOverride,
        readStdin: readStdinOnce,
      },
      COMMAND_REGISTRY,
    );
    return renderCliResult(result, parsed.flags.json, io);
  } catch (_error) {
    const result = createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure",
      "Try again with --json for structured output.",
    );
    return renderCliResult(result, parsed.flags.json, io);
  }
};
