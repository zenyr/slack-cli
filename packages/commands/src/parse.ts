import type { CliOptions, ParsedArgv } from "./types";

const isGlobalHelpFlag = (token: string): boolean => {
  return token === "--help" || token === "-h";
};

const isGlobalVersionFlag = (token: string): boolean => {
  return token === "--version" || token === "-v";
};

const isGlobalJsonFlag = (token: string): boolean => {
  return token === "--json";
};

const parseOptionToken = (
  token: string,
  nextToken: string | undefined,
): { consumedNext: boolean; key: string; value: string | boolean } => {
  const withoutPrefix = token.slice(2);
  const eqIndex = withoutPrefix.indexOf("=");

  if (eqIndex >= 0) {
    const key = withoutPrefix.slice(0, eqIndex);
    const value = withoutPrefix.slice(eqIndex + 1);
    return { consumedNext: false, key, value };
  }

  if (nextToken && !nextToken.startsWith("-")) {
    return {
      consumedNext: true,
      key: withoutPrefix,
      value: nextToken,
    };
  }

  return {
    consumedNext: false,
    key: withoutPrefix,
    value: true,
  };
};

export const parseArgv = (argv: string[]): ParsedArgv => {
  const options: CliOptions = {};
  const tokens: string[] = [];
  const positionalsFromDoubleDash: string[] = [];
  let parseOnlyPositionals = false;

  const flags = {
    json: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (parseOnlyPositionals) {
      positionalsFromDoubleDash.push(token);
      continue;
    }

    if (token === "--") {
      parseOnlyPositionals = true;
      continue;
    }

    if (isGlobalHelpFlag(token)) {
      flags.help = true;
      continue;
    }

    if (isGlobalVersionFlag(token)) {
      flags.version = true;
      continue;
    }

    if (isGlobalJsonFlag(token)) {
      flags.json = true;
      continue;
    }

    if (token.startsWith("--") && token.length > 2) {
      const nextToken = argv[index + 1];
      const parsedOption = parseOptionToken(token, nextToken);
      options[parsedOption.key] = parsedOption.value;
      if (parsedOption.consumedNext) {
        index += 1;
      }
      continue;
    }

    tokens.push(token);
  }

  return {
    flags,
    tokens,
    positionalsFromDoubleDash,
    options,
  };
};
