import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type {
  ResolvedSlackToken,
  SlackClientError,
  SlackUserGroup,
  SlackUsergroupsWebApiClient,
} from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "usergroups.list";
const MAX_RENDERED_USER_IDS = 5;

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

const parseBooleanOptionValue = (
  optionName: string,
  value: string | boolean | undefined,
): { value?: boolean; error?: CliResult } => {
  if (value === undefined) {
    return {};
  }

  if (typeof value === "boolean") {
    return { value };
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  ) {
    return { value: true };
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "n" ||
    normalized === "off"
  ) {
    return { value: false };
  }

  return {
    error: createError(
      "INVALID_ARGUMENT",
      `Invalid --${optionName} value: ${value}.`,
      `Use boolean value for --${optionName}: true|false|1|0|yes|no.`,
      COMMAND_ID,
    ),
  };
};

const formatUsersForTextLine = (users: readonly string[]): string => {
  if (users.length <= MAX_RENDERED_USER_IDS) {
    return users.join(",");
  }

  const renderedUsers = users.slice(0, MAX_RENDERED_USER_IDS).join(",");
  const remainingUsersCount = users.length - MAX_RENDERED_USER_IDS;
  return `${renderedUsers}, +${remainingUsersCount} more`;
};

const toGroupLine = (group: SlackUserGroup): string => {
  const description = group.description === undefined ? "" : ` - ${group.description}`;
  const count = group.userCount === undefined ? "" : ` [members: ${group.userCount}]`;
  const users = group.users === undefined ? "" : ` [users: ${formatUsersForTextLine(group.users)}]`;
  return `- @${group.handle} (${group.id}) ${group.name}${description}${count}${users}`;
};

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsergroupsListHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUsergroupsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultUsergroupsListDeps: UsergroupsListHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createUsergroupsListHandler = (
  depsOverrides: Partial<UsergroupsListHandlerDeps> = {},
) => {
  const deps: UsergroupsListHandlerDeps = {
    ...defaultUsergroupsListDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    if (request.positionals.length > 0) {
      return createError(
        "INVALID_ARGUMENT",
        "usergroups list does not accept positional arguments.",
        "Use: slack usergroups list [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]",
        COMMAND_ID,
      );
    }

    const includeUsersParsed = parseBooleanOptionValue(
      "include-users",
      request.options["include-users"],
    );
    if (includeUsersParsed.error !== undefined) {
      return includeUsersParsed.error;
    }

    const includeDisabledParsed = parseBooleanOptionValue(
      "include-disabled",
      request.options["include-disabled"],
    );
    if (includeDisabledParsed.error !== undefined) {
      return includeDisabledParsed.error;
    }

    const includeCountParsed = parseBooleanOptionValue(
      "include-count",
      request.options["include-count"],
    );
    if (includeCountParsed.error !== undefined) {
      return includeCountParsed.error;
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const result = await client.listUsergroups({
        includeUsers: includeUsersParsed.value,
        includeDisabled: includeDisabledParsed.value,
        includeCount: includeCountParsed.value,
      });

      const textLines: string[] = [`Found ${result.usergroups.length} user groups.`, ""];
      for (const group of result.usergroups) {
        textLines.push(toGroupLine(group));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Listed ${result.usergroups.length} user groups`,
        data: {
          usergroups: result.usergroups,
          count: result.usergroups.length,
        },
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.list failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsListHandler = createUsergroupsListHandler();
