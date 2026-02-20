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

const hasNamespace = (token: string, registry: CommandStrategy[]): boolean => {
  if (token.length === 0) {
    return false;
  }

  return registry.some((strategy) => strategy.path[0] === token);
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

    const helpPositionals =
      parsed.tokens.length > 0
        ? [...parsed.tokens, ...parsed.positionalsFromDoubleDash]
        : parsed.positionalsFromDoubleDash;

    return await helpCommand.execute({
      commandPath: ["help"],
      positionals: helpPositionals,
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
    const namespaceToken = parsed.tokens[0] ?? "";
    const attemptedCommand = parsed.tokens.join(" ").trim();
    const shouldRouteToNamespaceHelp =
      parsed.tokens.length === 1 && hasNamespace(namespaceToken, registry);

    if (shouldRouteToNamespaceHelp) {
      const helpCommand = registry.find((strategy) => strategy.id === "help");
      if (helpCommand === undefined) {
        return createError("INTERNAL_ERROR", "help command is not registered");
      }

      return await helpCommand.execute({
        commandPath: ["help"],
        positionals: [namespaceToken],
        options: parsed.options,
        flags: parsed.flags,
        context,
      });
    }

    if (hasNamespace(namespaceToken, registry)) {
      return createError(
        "UNKNOWN_COMMAND",
        `Unknown command: ${attemptedCommand}`,
        `Run '${CLI_NAME} ${namespaceToken} --help' to see available subcommands.`,
        namespaceToken,
      );
    }

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
