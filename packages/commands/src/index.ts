import { createError } from "./errors";
import { DEFAULT_IO, renderCliResult } from "./output";
import { parseArgv } from "./parse";
import { COMMAND_REGISTRY } from "./registry";
import { routeCli } from "./router";
import type { CliIo } from "./types";

type RunCliOptions = {
  version?: string;
  io?: CliIo;
};

export const runCli = async (argv: string[], options: RunCliOptions = {}): Promise<number> => {
  const version = options.version ?? "0.0.0-dev";
  const io = options.io ?? DEFAULT_IO;
  const parsed = parseArgv(argv);

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
