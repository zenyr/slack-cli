import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackReactionsGetWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "reactions.list";
const USAGE_HINT =
  "Usage: slack reactions list <channel-id(required,non-empty)> <timestamp(required,non-empty)> [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ReactionsListHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackReactionsGetWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ReactionsListHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for reactions.list.",
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

export const createReactionsListHandler = (
  depsOverrides: Partial<ReactionsListHandlerDeps> = {},
) => {
  const deps: ReactionsListHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannel = request.positionals[0];
    if (rawChannel === undefined || rawChannel.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "reactions list requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawTimestamp = request.positionals[1];
    if (rawTimestamp === undefined || rawTimestamp.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "reactions list requires <timestamp>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const channel = rawChannel.trim();
    const timestamp = rawTimestamp.trim();

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.getReactions({ channel, timestamp });

      const textLines: string[] =
        data.reactions.length === 0
          ? [`Reactions for message ${data.ts} in ${data.channel}:`, "No reactions found."]
          : [
              `Reactions for message ${data.ts} in ${data.channel}:`,
              ...data.reactions.map((r) => `:${r.name}: (${r.count}) - ${r.users.join(", ")}`),
            ];

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Listed reactions for message ${data.ts} in ${data.channel}.`,
        data: {
          channel: data.channel,
          ts: data.ts,
          reactions: data.reactions,
        },
        textLines,
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const reactionsListHandler = createReactionsListHandler();
