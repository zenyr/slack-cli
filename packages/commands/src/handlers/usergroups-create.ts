import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackClientError,
  SlackUsergroupsWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.create";
const USAGE_HINT =
  "Usage: slack usergroups create <name(required,non-empty)> <handle(required,non-empty)> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]";

const mapSlackErrorToCliResult = (error: SlackClientError): CliResult => {
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

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsergroupsCreateHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUsergroupsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultUsergroupsCreateDeps: UsergroupsCreateHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const isCliErrorResult = (value: string | string[] | undefined | CliResult): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

const readDescriptionOption = (options: CliOptions): string | undefined | CliResult => {
  const rawDescription = options.description;
  if (rawDescription === undefined) {
    return undefined;
  }

  if (rawDescription === true) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --description requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof rawDescription !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --description requires a string value.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const description = rawDescription.trim();
  if (description.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --description value cannot be empty. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return description;
};

const readChannelsOption = (options: CliOptions): string[] | undefined | CliResult => {
  const rawChannels = options.channels;
  if (rawChannels === undefined) {
    return undefined;
  }

  if (rawChannels === true) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --channels requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof rawChannels !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --channels requires a string value.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const channels = rawChannels.split(",").map((value) => value.trim());
  if (channels.length === 0 || channels.some((value) => value.length === 0)) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups create --channels must be comma-separated non-empty channel ids.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return channels;
};

export const createUsergroupsCreateHandler = (
  depsOverrides: Partial<UsergroupsCreateHandlerDeps> = {},
) => {
  const deps: UsergroupsCreateHandlerDeps = {
    ...defaultUsergroupsCreateDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawName = request.positionals[0];
    if (rawName === undefined || rawName.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create requires <name>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const rawHandle = request.positionals[1];
    if (rawHandle === undefined || rawHandle.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create requires <handle>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 2) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups create accepts exactly 2 positional arguments: <name> <handle>.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const name = rawName.trim();
    const handle = rawHandle.trim();

    const descriptionOrError = readDescriptionOption(request.options);
    if (isCliErrorResult(descriptionOrError)) {
      return descriptionOrError;
    }

    const channelsOrError = readChannelsOption(request.options);
    if (isCliErrorResult(channelsOrError)) {
      return channelsOrError;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const usergroup = await client.createUsergroup({
        name,
        handle,
        description: descriptionOrError,
        channels: channelsOrError,
      });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Created user group @${usergroup.handle}.`,
        data: {
          usergroup,
        },
        textLines: [`Created user group @${usergroup.handle} (${usergroup.id}) ${usergroup.name}.`],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.create failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsCreateHandler = createUsergroupsCreateHandler();
