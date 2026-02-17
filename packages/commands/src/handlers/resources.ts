import { RESOURCES } from "@zenyr/slack-cli-config";

import type { CliResult, CommandRequest } from "../types";

export const resourcesHandler = (_request: CommandRequest): CliResult => {
  const lines: string[] = ["Available resources:", ""];

  for (const resource of RESOURCES) {
    lines.push(`- ${resource.uri}`);
    lines.push(`  ${resource.title} (${resource.format})`);
    lines.push(`  ${resource.description}`);
  }

  return {
    ok: true,
    command: "resources",
    message: "Resources listed",
    data: RESOURCES,
    textLines: lines,
  };
};
