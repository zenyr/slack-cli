import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackChannelJoinWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "channels.leave";

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]+$/;

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ChannelsLeaveHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackChannelJoinWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ChannelsLeaveHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for channels.leave.",
      "Retry with --json for structured output.",
      COMMAND_ID,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_AUTH_ERROR":
      return createError(
        "INVALID_ARGUMENT",
        `${error.message} [AUTH_ERROR]`,
        error.hint,
        COMMAND_ID,
      );
    case "SLACK_API_ERROR": {
      const reason =
        error.details === undefined ? error.message : `${error.message} ${error.details}`;
      return createError("INVALID_ARGUMENT", `${reason} [SLACK_API_ERROR]`, error.hint, COMMAND_ID);
    }
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

export const createChannelsLeaveHandler = (
  depsOverrides: Partial<ChannelsLeaveHandlerDeps> = {},
) => {
  const deps: ChannelsLeaveHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannelId = request.positionals[0];
    if (rawChannelId === undefined || rawChannelId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "channels leave requires <channel-id>. [MISSING_ARGUMENT]",
        "Usage: slack channels leave <channel-id> [--json]",
        COMMAND_ID,
      );
    }

    const channelId = rawChannelId.trim();
    if (!CHANNEL_ID_RE.test(channelId)) {
      return createError(
        "INVALID_ARGUMENT",
        `Invalid channel ID format: ${channelId}. [INVALID_CHANNEL_ID]`,
        "Channel IDs start with C, G, or D followed by uppercase letters and digits (e.g. C01AB2CDE).",
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));

      if (resolvedToken.token.startsWith("xoxb")) {
        return createError(
          "INVALID_ARGUMENT",
          "channels leave requires a user token (xoxp). Bot tokens are not supported.",
          "Use a user token (xoxp) to leave channels.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      await client.leaveChannel(channelId);

      return {
        ok: true,
        command: COMMAND_ID,
        data: { channelId },
        textLines: [`Left channel ${channelId}.`],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const channelsLeaveHandler = createChannelsLeaveHandler();
