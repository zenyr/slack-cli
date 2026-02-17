import { CLI_NAME } from "@zenyr/slack-cli-config";

import { createError } from "./errors";
import type { CliContext, CliResult, CommandRequest, CommandStrategy, ParsedArgv } from "./types";

const isPrefix = (path: string[], tokens: string[]): boolean => {
  if (path.length > tokens.length) {
    return false;
  }

  for (let index = 0; index < path.length; index += 1) {
    if (path[index] !== tokens[index]) {
      return false;
    }
  }

  return true;
};

const matchCommand = (
  tokens: string[],
  registry: CommandStrategy[],
): CommandStrategy | undefined => {
  let bestMatch: CommandStrategy | undefined;

  for (const definition of registry) {
    if (!isPrefix(definition.path, tokens)) {
      continue;
    }

    if (bestMatch === undefined || definition.path.length > bestMatch.path.length) {
      bestMatch = definition;
    }
  }

  return bestMatch;
};

export const routeCli = async (
  parsed: ParsedArgv,
  context: CliContext,
  registry: CommandStrategy[],
): Promise<CliResult> => {
  if (parsed.flags.help || parsed.tokens.length === 0) {
    const helpCommand = registry.find((strategy) => strategy.id === "help");
    if (helpCommand === undefined) {
      return createError("INTERNAL_ERROR", "help command is not registered");
    }

    return await helpCommand.execute({
      commandPath: ["help"],
      positionals: [],
      options: parsed.options,
      flags: parsed.flags,
      context,
    });
  }

  if (parsed.flags.version) {
    const versionCommand = registry.find((strategy) => strategy.id === "version");

    if (versionCommand === undefined) {
      return createError("INTERNAL_ERROR", "version command is not registered");
    }

    return await versionCommand.execute({
      commandPath: ["version"],
      positionals: [],
      options: parsed.options,
      flags: parsed.flags,
      context,
    });
  }

  const matchedCommand = matchCommand(parsed.tokens, registry);
  if (matchedCommand === undefined) {
    const command = parsed.tokens[0] ?? "";
    return createError(
      "UNKNOWN_COMMAND",
      `Unknown command: ${command}`,
      `Run '${CLI_NAME} --help' to see available commands.`,
      command,
    );
  }

  const positionals = [
    ...parsed.tokens.slice(matchedCommand.path.length),
    ...parsed.positionalsFromDoubleDash,
  ];

  const request: CommandRequest = {
    commandPath: matchedCommand.path,
    positionals,
    options: parsed.options,
    flags: parsed.flags,
    context,
  };

  return await matchedCommand.execute(request);
};
