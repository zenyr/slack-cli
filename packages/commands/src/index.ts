import { createError } from "./errors";
import { DEFAULT_IO, renderCliResult } from "./output";
import { parseArgv } from "./parse";
import { COMMAND_REGISTRY } from "./registry";
import { routeCli } from "./router";
import type { CliIo } from "./types";

type RunCliOptions = {
  version?: string;
  io?: CliIo;
  /** Override stdin source for testing. Defaults to process.stdin. */
  readStdin?: () => Promise<string | undefined>;
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
  const parsed = parseArgv(argv);

  // When --blocks is a bare flag (true) and stdin is available, use stdin as the blocks text.
  if (parsed.options.blocks === true) {
    const stdinText = await readStdin();
    if (stdinText !== undefined) {
      parsed.options.blocks = stdinText;
    }
  }

  const runSubcommand = async (subArgv: string[]) => {
    return await routeCli(
      parseArgv(subArgv),
      {
        version,
        runSubcommand,
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
