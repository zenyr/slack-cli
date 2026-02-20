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

const normalizeNamespaceAlias = (token: string): string => {
  if (token === "message") {
    return "messages";
  }

  return token;
};

const normalizeCommandTokens = (tokens: string[]): string[] => {
  if (tokens.length === 0) {
    return tokens;
  }

  const firstToken = tokens[0];
  if (firstToken === undefined) {
    return tokens;
  }

  const normalizedFirstToken = normalizeNamespaceAlias(firstToken);
  if (normalizedFirstToken === firstToken) {
    return tokens;
  }

  return [normalizedFirstToken, ...tokens.slice(1)];
};

const isLikelyUrlToken = (token: string): boolean => {
  return token.startsWith("http://") || token.startsWith("https://");
};

const resolveImplicitMessagesCommand = (
  tokens: string[],
  registry: CommandStrategy[],
): CommandStrategy | undefined => {
  if (tokens.length === 0) {
    return undefined;
  }

  const firstToken = tokens[0];
  if (firstToken === undefined || hasNamespace(firstToken, registry)) {
    return undefined;
  }

  const implicitTokens = ["messages", ...tokens];
  const matched = matchCommand(implicitTokens, registry);
  if (matched === undefined || matched.path[0] !== "messages") {
    const firstToken = tokens[0];
    if (firstToken === undefined || !isLikelyUrlToken(firstToken)) {
      return undefined;
    }

    const implicitFetchTokens = ["messages", "fetch", ...tokens];
    const matchedFetch = matchCommand(implicitFetchTokens, registry);
    if (matchedFetch === undefined || matchedFetch.id !== "messages-fetch") {
      return undefined;
    }

    return matchedFetch;
  }

  return matched;
};

const listNamespaceSubcommands = (namespace: string, registry: CommandStrategy[]): string[] => {
  const subcommands: string[] = [];

  for (const strategy of registry) {
    if (strategy.path[0] !== namespace || strategy.path.length <= 1) {
      continue;
    }

    const subcommand = strategy.path.slice(1).join(" ");
    if (!subcommands.includes(subcommand)) {
      subcommands.push(subcommand);
    }
  }

  return subcommands;
};

export const routeCli = async (
  parsed: ParsedArgv,
  context: CliContext,
  registry: CommandStrategy[],
): Promise<CliResult> => {
  const normalizedTokens = normalizeCommandTokens(parsed.tokens);

  if (parsed.flags.help || parsed.tokens.length === 0) {
    const helpCommand = registry.find((strategy) => strategy.id === "help");
    if (helpCommand === undefined) {
      return createError("INTERNAL_ERROR", "help command is not registered");
    }

    const helpPositionals =
      normalizedTokens.length > 0
        ? [...normalizedTokens, ...parsed.positionalsFromDoubleDash]
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

  const matchedCommand = matchCommand(normalizedTokens, registry);
  if (matchedCommand === undefined) {
    const namespaceToken = normalizedTokens[0] ?? "";
    const attemptedCommand = normalizedTokens.join(" ").trim();
    const shouldRouteToNamespaceHelp =
      normalizedTokens.length === 1 && hasNamespace(namespaceToken, registry);

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

    const implicitMessagesMatch = resolveImplicitMessagesCommand(normalizedTokens, registry);
    if (implicitMessagesMatch !== undefined) {
      const implicitTokens =
        implicitMessagesMatch.id === "messages-fetch" && isLikelyUrlToken(normalizedTokens[0] ?? "")
          ? ["messages", "fetch", ...normalizedTokens]
          : ["messages", ...normalizedTokens];
      const positionals = [
        ...implicitTokens.slice(implicitMessagesMatch.path.length),
        ...parsed.positionalsFromDoubleDash,
      ];

      return await implicitMessagesMatch.execute({
        commandPath: implicitMessagesMatch.path,
        positionals,
        options: parsed.options,
        flags: parsed.flags,
        context,
      });
    }

    if (hasNamespace(namespaceToken, registry)) {
      const availableSubcommands = listNamespaceSubcommands(namespaceToken, registry);
      const subcommandsHint =
        availableSubcommands.length > 0
          ? `Available subcommands: ${availableSubcommands.join(", ")}.`
          : "No subcommands available.";

      return createError(
        "UNKNOWN_COMMAND",
        `Unknown command: ${attemptedCommand}`,
        `${subcommandsHint} Run '${CLI_NAME} ${namespaceToken} --help' to see details.`,
        namespaceToken,
      );
    }

    const command = normalizedTokens[0] ?? "";
    return createError(
      "UNKNOWN_COMMAND",
      `Unknown command: ${command}`,
      `Run '${CLI_NAME} --help' to see available commands.`,
      command,
    );
  }

  const positionals = [
    ...normalizedTokens.slice(matchedCommand.path.length),
    ...parsed.positionalsFromDoubleDash,
  ];

  if (matchedCommand.requiresExplicitTokenType === true && context.tokenTypeOverride === undefined) {
    const commandName = matchedCommand.path.join(" ");
    return createError(
      "INVALID_ARGUMENT",
      `'${commandName}' requires explicit token type selection. [MISSING_ARGUMENT]`,
      `Add --xoxp (user) or --xoxb (bot).`,
      commandName,
    );
  }

  // Validate --xoxp/--xoxb against command's allowed token types
  if (context.tokenTypeOverride !== undefined && matchedCommand.allowedTokenTypes !== undefined) {
    if (!matchedCommand.allowedTokenTypes.includes(context.tokenTypeOverride)) {
      const commandName = matchedCommand.path.join(" ");
      const requested = context.tokenTypeOverride;
      const allowed = matchedCommand.allowedTokenTypes.join(" or ");
      return createError(
        "INVALID_ARGUMENT",
        `'${commandName}' requires a ${allowed} token. --${requested} is not compatible.`,
        `Remove --${requested} or use a compatible token type.`,
        commandName,
      );
    }
  }

  const request: CommandRequest = {
    commandPath: matchedCommand.path,
    positionals,
    options: parsed.options,
    flags: parsed.flags,
    context,
  };

  return await matchedCommand.execute(request);
};
