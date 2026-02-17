import { CLI_NAME } from "@zenyr/slack-cli-config";

import { createError } from "./errors";
import type { CliContext, CliResult, CommandDefinition, CommandRequest, ParsedArgv } from "./types";

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
  registry: CommandDefinition[],
): CommandDefinition | undefined => {
  let bestMatch: CommandDefinition | undefined;

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
  registry: CommandDefinition[],
): Promise<CliResult> => {
  if (parsed.flags.help || parsed.tokens.length === 0) {
    const helpCommand = registry.find((definition) => definition.path[0] === "help");
    if (helpCommand === undefined) {
      return createError("INTERNAL_ERROR", "help command is not registered");
    }

    return await helpCommand.handler({
      commandPath: ["help"],
      positionals: [],
      options: parsed.options,
      flags: parsed.flags,
      context,
    });
  }

  if (parsed.flags.version) {
    const versionCommand = registry.find((definition) => definition.path[0] === "version");

    if (versionCommand === undefined) {
      return createError("INTERNAL_ERROR", "version command is not registered");
    }

    return await versionCommand.handler({
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

  return await matchedCommand.handler(request);
};
