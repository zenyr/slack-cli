import { TOOLS } from "@zenyr/slack-cli-config";

import type { CliResult, CommandRequest } from "../types";

export const toolsHandler = (_request: CommandRequest): CliResult => {
  const lines: string[] = ["Referenced tools:", ""];

  for (const tool of TOOLS) {
    lines.push(`- ${tool}`);
  }

  return {
    ok: true,
    command: "tools",
    message: "Tools listed",
    data: TOOLS,
    textLines: lines,
  };
};
