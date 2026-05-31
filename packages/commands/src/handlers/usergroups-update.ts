import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackClientError,
  SlackUsergroupsUpdateWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.update";
const USAGE_HINT =
  "Usage: slack usergroups update <usergroup-id(required,non-empty)> [--name=<name>] [--handle=<handle>] [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]";

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

type UsergroupsUpdateHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUsergroupsUpdateWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsergroupsUpdateHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const readDescriptionOption = (options: CliOptions): string | undefined | CliResult => {
  const descriptionValue = options.description;
  if (descriptionValue === undefined) {
    return undefined;
  }

  if (descriptionValue === true) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --description requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof descriptionValue !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --description requires a string value.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const description = descriptionValue.trim();
  if (description.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --description value cannot be empty. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return description;
};

const readChannelsOption = (options: CliOptions): string[] | undefined | CliResult => {
  const channelsValue = options.channels;
  if (channelsValue === undefined) {
    return undefined;
  }

  if (channelsValue === true) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --channels requires a value. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (typeof channelsValue !== "string") {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --channels requires comma-separated channel ids.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const normalized = channelsValue.trim();
  if (normalized.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups update --channels value cannot be empty. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const channelIds = normalized.split(",").map((value) => value.trim());
  if (channelIds.length === 0 || channelIds.some((value) => value.length === 0)) {
    return createError(
      "INVALID_ARGUMENT",
      `usergroups update --channels must contain non-empty comma-separated channel ids. Received: ${channelsValue}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return channelIds;
};

const readStringUpdateOption = (
  options: CliOptions,
  key: "name" | "handle",
): string | undefined | CliResult => {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `usergroups update --${key} requires a non-empty value. [MISSING_ARGUMENT]`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return value.trim();
};

const isCliErrorResult = (value: string | string[] | undefined | CliResult): value is CliResult => {
  return typeof value === "object" && value !== null && "ok" in value;
};

export const createUsergroupsUpdateHandler = (
  depsOverrides: Partial<UsergroupsUpdateHandlerDeps> = {},
) => {
  const deps: UsergroupsUpdateHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawId = request.positionals[0];
    if (rawId === undefined || rawId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update requires <usergroup-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (request.positionals.length > 3) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update accepts at most 3 positional arguments: <usergroup-id> [name] [handle].",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const id = rawId.trim();
    const nameOrError = readStringUpdateOption(request.options, "name");
    if (isCliErrorResult(nameOrError)) {
      return nameOrError;
    }

    const handleOrError = readStringUpdateOption(request.options, "handle");
    if (isCliErrorResult(handleOrError)) {
      return handleOrError;
    }

    const positionalName = request.positionals[1]?.trim();
    const positionalHandle = request.positionals[2]?.trim();
    if (nameOrError !== undefined && positionalName !== undefined) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update name must be provided only once.",
        "Use either positional [name] or --name=<name>, not both.",
        COMMAND_ID,
      );
    }
    if (handleOrError !== undefined && positionalHandle !== undefined) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update handle must be provided only once.",
        "Use either positional [handle] or --handle=<handle>, not both.",
        COMMAND_ID,
      );
    }

    const descriptionOrError = readDescriptionOption(request.options);
    if (isCliErrorResult(descriptionOrError)) {
      return descriptionOrError;
    }

    const channelsOrError = readChannelsOption(request.options);
    if (isCliErrorResult(channelsOrError)) {
      return channelsOrError;
    }

    if (
      nameOrError === undefined &&
      positionalName === undefined &&
      handleOrError === undefined &&
      positionalHandle === undefined &&
      descriptionOrError === undefined &&
      channelsOrError === undefined
    ) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups update requires at least one update field.",
        "Pass --name, --handle, --description, or --channels.",
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
      const updateParams = {
        id,
        name: nameOrError ?? positionalName,
        handle: handleOrError ?? positionalHandle,
        description: descriptionOrError,
        channels: channelsOrError,
      };
      const result = await client.updateUsergroup(updateParams);

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Updated user group @${result.usergroup.handle}.`,
        data: {
          usergroup: result.usergroup,
        },
        textLines: [
          `Updated user group ${result.usergroup.id}.`,
          `- @${result.usergroup.handle} ${result.usergroup.name}`,
        ],
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.update failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsUpdateHandler = createUsergroupsUpdateHandler();
