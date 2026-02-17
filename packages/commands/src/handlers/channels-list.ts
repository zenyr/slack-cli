import { createError } from "../errors";
import type { SlackChannel, SlackClientError, SlackListChannelsResult } from "../slack";
import { createSlackWebApiClient, isSlackClientError } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "channels.list";

const formatVisibility = (isPrivate: boolean): string => {
  return isPrivate ? "private" : "public";
};

const formatArchived = (isArchived: boolean): string => {
  return isArchived ? "archived" : "active";
};

const toChannelLine = (channel: SlackChannel): string => {
  const memberCountLabel =
    channel.memberCount === undefined ? "members n/a" : `${channel.memberCount} members`;
  return `#${channel.name} (${channel.id}) - ${formatVisibility(channel.isPrivate)}, ${formatArchived(channel.isArchived)}, ${memberCountLabel}`;
};

const buildTextLines = (result: SlackListChannelsResult): string[] => {
  const lines = [`Found ${result.channels.length} channels.`];

  for (const channel of result.channels) {
    lines.push(toChannelLine(channel));
  }

  if (result.nextCursor !== undefined) {
    // TODO(commands-owner): Add cursor/page flags for channels list and remove when handlers expose explicit pagination controls.
    lines.push("More channels available. Re-run after pagination flags land.");
  }

  return lines;
};

const mapSlackClientError = (error: SlackClientError): CliResult => {
  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_HTTP_ERROR": {
      const retryHint =
        error.retryAfterSeconds === undefined
          ? error.hint
          : `${error.hint ?? "Retry later."} Retry after ${error.retryAfterSeconds}s.`;
      return createError("INTERNAL_ERROR", error.message, retryHint, COMMAND_ID);
    }
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (isSlackClientError(error)) {
    return mapSlackClientError(error);
  }

  return createError(
    "INTERNAL_ERROR",
    "Failed to list channels due to unexpected runtime error.",
    "Retry with --json and inspect logs.",
    COMMAND_ID,
  );
};

export const channelsListHandler = async (_request: CommandRequest): Promise<CliResult> => {
  try {
    const client = createSlackWebApiClient();
    const result = await client.listChannels();

    return {
      ok: true,
      command: COMMAND_ID,
      data: result,
      textLines: buildTextLines(result),
    };
  } catch (error) {
    return mapSlackErrorToCliResult(error);
  }
};
