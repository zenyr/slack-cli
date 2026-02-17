import { createError } from "../errors";
import type { ResolvedSlackToken, SlackWebApiClient } from "../slack";
import { createSlackWebApiClient, isSlackClientError, resolveSlackToken } from "../slack";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.search";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type MessagesSearchHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: MessagesSearchHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const formatSuccessLines = (query: string, total: number, count: number): string[] => {
  return [
    `Messages search completed for query: ${query}`,
    `Total matches: ${total}`,
    `Returned messages: ${count}`,
  ];
};

const mapSlackErrorToCliResult = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure",
      "Try again with --json for structured output.",
      COMMAND_ID,
    );
  }

  switch (error.code) {
    case "SLACK_CONFIG_ERROR":
    case "SLACK_AUTH_ERROR":
    case "SLACK_API_ERROR":
      return createError("INVALID_ARGUMENT", error.message, error.hint, COMMAND_ID);
    case "SLACK_HTTP_ERROR":
    case "SLACK_RESPONSE_ERROR":
      return createError("INTERNAL_ERROR", error.message, error.hint, COMMAND_ID);
  }
};

export const createMessagesSearchHandler = (
  depsOverrides: Partial<MessagesSearchHandlerDeps> = {},
) => {
  const deps: MessagesSearchHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const query = request.positionals.join(" ").trim();
    if (query.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages search requires <query>",
        "Example: slack messages search deploy --json",
        COMMAND_ID,
      );
    }

    try {
      const resolvedToken = await Promise.resolve(deps.resolveToken(deps.env));
      if (
        resolvedToken.tokenType === "xoxb" ||
        resolvedToken.source === "SLACK_MCP_XOXB_TOKEN" ||
        resolvedToken.source === "env:SLACK_MCP_XOXB_TOKEN"
      ) {
        return createError(
          "INVALID_ARGUMENT",
          "messages search requires user token (xoxp).",
          "Set SLACK_MCP_XOXP_TOKEN. Bot tokens cannot call search.messages.",
          COMMAND_ID,
        );
      }

      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.searchMessages(query);

      return {
        ok: true,
        command: COMMAND_ID,
        message: "Messages search completed",
        data,
        textLines: formatSuccessLines(data.query, data.total, data.messages.length),
      };
    } catch (error) {
      return mapSlackErrorToCliResult(error);
    }
  };
};

export const messagesSearchHandler = createMessagesSearchHandler();
