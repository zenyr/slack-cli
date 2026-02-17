import { CLI_NAME, COMMANDS } from "@zenyr/slack-cli-config";

import type { CliResult, CommandRequest } from "../types";

const toCommandLine = (name: string, args: string): string => {
  const suffix = args.trim();
  return suffix.length > 0 ? `${name} ${suffix}` : name;
};

export const helpHandler = (_request: CommandRequest): CliResult => {
  const lines: string[] = [
    `${CLI_NAME} - Bun CLI for Slack workflows`,
    "",
    "Usage:",
    `  ${CLI_NAME} <command> [options]`,
    "",
    "Commands:",
  ];

  const commandLines = COMMANDS.map((command) => toCommandLine(command.name, command.args));
  const maxWidth = Math.max(...commandLines.map((line) => line.length), 0) + 2;

  for (const command of COMMANDS) {
    const commandLine = toCommandLine(command.name, command.args);
    lines.push(`  ${commandLine.padEnd(maxWidth)}${command.description}`);
  }

  lines.push("");
  lines.push("Global options:");
  lines.push("  --help, -h               Show help");
  lines.push("  --version, -v            Show version");
  lines.push("  --json                   Print JSON output");

  return {
    ok: true,
    command: "help",
    message: "Help displayed",
    data: {
      cli: CLI_NAME,
      commands: COMMANDS,
    },
    textLines: lines,
  };
};
