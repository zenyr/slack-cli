import type { CliResult, CommandRequest } from "../types";

export const versionHandler = (request: CommandRequest): CliResult => {
  return {
    ok: true,
    command: "version",
    message: request.context.version,
    data: {
      version: request.context.version,
    },
    textLines: [request.context.version],
  };
};
