import { CLI_NAME, COMMANDS, RESOURCES, TOOLS } from "@zenyr/slack-cli-config";

type RunCliOptions = {
  version?: string;
};

function printHelp(): void {
  console.log(`${CLI_NAME} - Bun CLI for Slack MCP workflows`);
  console.log("");
  console.log("Usage:");
  console.log(`  ${CLI_NAME} <command> [options]`);
  console.log("");
  console.log("Commands:");

  for (const command of COMMANDS) {
    const fullName = command.args
      ? `${command.name} ${command.args}`
      : command.name;
    console.log(`  ${fullName.padEnd(24)}${command.description}`);
  }

  console.log("");
  console.log("Global options:");
  console.log("  --help, -h               Show help");
  console.log("  --version, -v            Show version");
}

function printResources(json: boolean): void {
  if (json) {
    console.log(JSON.stringify(RESOURCES, null, 2));
    return;
  }

  console.log("Available resources:");
  console.log("");
  for (const resource of RESOURCES) {
    console.log(`- ${resource.uri}`);
    console.log(`  ${resource.title} (${resource.format})`);
    console.log(`  ${resource.description}`);
  }
}

function printTools(json: boolean): void {
  if (json) {
    console.log(JSON.stringify(TOOLS, null, 2));
    return;
  }

  console.log("Referenced tools:");
  console.log("");
  for (const tool of TOOLS) {
    console.log(`- ${tool}`);
  }
}

export function runCli(argv: string[], options: RunCliOptions = {}): number {
  const version = options.version ?? "0.0.0-dev";

  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv[0] === "--help" ||
    argv[0] === "-h"
  ) {
    printHelp();
    return 0;
  }

  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") {
    console.log(version);
    return 0;
  }

  const command = argv[0];
  const json = argv.includes("--json");

  if (command === "resources") {
    printResources(json);
    return 0;
  }

  if (command === "tools") {
    printTools(json);
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  console.error(`Run '${CLI_NAME} --help' to see available commands.`);
  return 1;
}
