import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackReactionsWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "reactions.remove";
const USAGE_HINT =
  "Usage: slack reactions remove <channel-id(required,non-empty)> <timestamp(required,non-empty)> <emoji-name(required,non-empty)> [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ReactionsRemoveHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackReactionsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ReactionsRemoveHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for reactions.remove.",
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

const isValidSlackTimestamp = (value: string): boolean => {
  return /^\d+\.\d+$/.test(value);
};

const hasWhitespace = (value: string): boolean => {
  return /\s/.test(value);
};

export const createReactionsRemoveHandler = (
  depsOverrides: Partial<ReactionsRemoveHandlerDeps> = {},
) => {
  const deps: ReactionsRemoveHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "reactions remove requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawTimestamp = request.positionals[1];
    if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "reactions remove requires <timestamp>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawName = request.positionals[2];
    if (rawName === undefined || rawName.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "reactions remove requires <emoji-name>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();
    const timestamp = rawTimestamp.trim();
    const name = rawName.trim();

    if (!isValidSlackTimestamp(timestamp)) {
      return createError(
        "INVALID_ARGUMENT",
        `reactions remove requires <timestamp> in Slack format seconds.fraction. Received: ${timestamp}`,
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (hasWhitespace(name)) {
      return createError(
        "INVALID_ARGUMENT",
        `reactions remove requires <emoji-name> without whitespace. Received: ${name}`,
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.removeReaction({ channel, timestamp, name });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Reaction :${data.name}: removed from ${data.channel}.`,
        data: {
          channel: data.channel,
          timestamp: data.ts,
          name: data.name,
        },
        textLines: [`Removed :${data.name}: from ${data.channel} at ${data.ts}.`],
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const reactionsRemoveHandler = createReactionsRemoveHandler();
