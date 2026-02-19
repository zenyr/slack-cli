import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackPinsWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.unpin";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesUnpinHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackPinsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesUnpinHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for messages.unpin.",
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

export const createMessagesUnpinHandler = (
  depsOverrides: Partial<MessagesUnpinHandlerDeps> = {},
) => {
  const deps: MessagesUnpinHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages unpin requires <channel-id>. [MISSING_ARGUMENT]",
        "Usage: slack messages unpin <channel-id> <timestamp> [--json]",
        COMMAND_ID,
      );
    }

    const rawTimestamp = request.positionals[1];
    if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages unpin requires <timestamp>. [MISSING_ARGUMENT]",
        "Usage: slack messages unpin <channel-id> <timestamp> [--json]",
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();
    const timestamp = rawTimestamp.trim();

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.removePin({ channel, timestamp });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Unpinned message ${data.ts} in ${data.channel}.`,
        data: {
          channel: data.channel,
          timestamp: data.ts,
        },
        textLines: [`Unpinned message ${data.ts} in ${data.channel}.`],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const messagesUnpinHandler = createMessagesUnpinHandler();
