import { CLI_NAME, type CliCommand, COMMANDS } from "@zenyr/slack-cli-config";

import { createError } from "../errors";
import type { CliResult, CommandRequest } from "../types";

type CommandGroup = {
  name: string;
  standalone?: CliCommand;
  subcommands: CliCommand[];
};

const splitCommandName = (name: string): string[] => {
  return name
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
};

const toCommandLine = (name: string, args: string): string => {
  const normalizedArgs = args.trim();
  return normalizedArgs.length > 0 ? `${name} ${normalizedArgs}` : name;
};

const buildCommandGroups = (): CommandGroup[] => {
  const order: string[] = [];
  const groups = new Map<string, CommandGroup>();

  for (const command of COMMANDS) {
    const tokens = splitCommandName(command.name);
    const topLevel = tokens[0];
    if (topLevel === undefined) {
      continue;
    }

    let group = groups.get(topLevel);
    if (group === undefined) {
      group = {
        name: topLevel,
        subcommands: [],
      };
      groups.set(topLevel, group);
      order.push(topLevel);
    }

    if (tokens.length === 1) {
      group.standalone = command;
      continue;
    }

    group.subcommands.push(command);
  }

  return order
    .map((name) => groups.get(name))
    .filter((group): group is CommandGroup => group !== undefined);
};

const renderRootHelp = (groups: CommandGroup[]): string[] => {
  const lines: string[] = [
    `${CLI_NAME} - Bun CLI for Slack workflows`,
    "",
    "Usage:",
    `  ${CLI_NAME} <command> [options]`,
    "",
    "Commands:",
  ];

  const entries = groups.map((group) => {
    if (group.subcommands.length > 0) {
      const subNames = group.subcommands
        .map((cmd) => splitCommandName(cmd.name).slice(1).join(" "))
        .join("|");
      return {
        label: group.name,
        description: subNames,
      };
    }

    if (group.standalone !== undefined) {
      return {
        label: toCommandLine(group.standalone.name, group.standalone.args),
        description: group.standalone.description,
      };
    }

    return {
      label: group.name,
      description: "",
    };
  });

  const maxWidth = Math.max(...entries.map((entry) => entry.label.length), 0) + 2;
  for (const entry of entries) {
    lines.push(`  ${entry.label.padEnd(maxWidth)}${entry.description}`);
  }

  lines.push("");
  lines.push("Global options:");
  lines.push("  --help, -h    Show help");
  lines.push("  --version, -v Show version");
  lines.push("  --json        Print JSON output");

  return lines;
};

const renderNamespaceHelp = (group: CommandGroup): string[] => {
  if (group.subcommands.length === 0 && group.standalone !== undefined) {
    const tokens = splitCommandName(group.standalone.name);
    const argsStr = group.standalone.args.trim();
    const usageParts = [CLI_NAME, ...tokens, ...(argsStr.length > 0 ? [argsStr] : [])];

    return [
      `${CLI_NAME} ${group.name}`,
      "",
      "Usage:",
      `  ${usageParts.join(" ")}`,
      "",
      group.standalone.description,
    ];
  }

  const subcommandEntries = group.subcommands.map((command) => {
    const tokens = splitCommandName(command.name);
    const subcommand = tokens.slice(1).join(" ");
    const label = toCommandLine(subcommand, command.args);

    return {
      label,
      description: command.description,
    };
  });

  const maxWidth = Math.max(...subcommandEntries.map((entry) => entry.label.length), 0) + 2;
  const lines: string[] = [
    `${CLI_NAME} ${group.name}`,
    "",
    "Usage:",
    `  ${CLI_NAME} ${group.name} <command> [options]`,
    "",
    "Commands:",
  ];

  for (const entry of subcommandEntries) {
    lines.push(`  ${entry.label.padEnd(maxWidth)}${entry.description}`);
  }

  return lines;
};

export const helpHandler = (request: CommandRequest): CliResult => {
  const groups = buildCommandGroups();
  const namespace = request.positionals[0];

  if (namespace === undefined) {
    return {
      ok: true,
      command: "help",
      message: "Help displayed",
      data: {
        cli: CLI_NAME,
      },
      textLines: renderRootHelp(groups),
    };
  }

  const scopedGroup = groups.find((group) => group.name === namespace);
  if (scopedGroup === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      `Unknown namespace: ${namespace}`,
      `Run '${CLI_NAME} --help' to see available namespaces.`,
      "help",
    );
  }

  return {
    ok: true,
    command: "help",
    message: `Help for ${namespace}`,
    data: {
      cli: CLI_NAME,
      namespace,
    },
    textLines: renderNamespaceHelp(scopedGroup),
  };
};
