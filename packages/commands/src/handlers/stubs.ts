import { createError } from "../errors";
import type { CliResult, CommandRequest } from "../types";

const commandLabel = (path: string[]): string => {
  return path.join(".");
};

const createStubResult = (request: CommandRequest, summary: string): CliResult => {
  // TODO(commands-owner): Replace stub errors with Slack API-backed handlers in next integration phase; remove when each command returns real success payloads from live API data.
  const command = commandLabel(request.commandPath);
  const detail = `${summary} command is not implemented yet.`;

  return createError(
    "NOT_IMPLEMENTED",
    detail,
    "Stub only in MVP. Slack API wiring planned next phase.",
    command,
  );
};

export const channelsListHandler = (request: CommandRequest): CliResult => {
  return createStubResult(request, "channels.list");
};

export const usersListHandler = (request: CommandRequest): CliResult => {
  return createStubResult(request, "users.list");
};

export const messagesSearchHandler = (request: CommandRequest): CliResult => {
  if (request.positionals.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages search requires <query>",
      "Example: slack messages search deploy --json",
      commandLabel(request.commandPath),
    );
  }

  return createStubResult(request, "messages.search");
};
