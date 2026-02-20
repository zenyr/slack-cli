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

const COMMAND_ID = "usergroups.get";
const USERGROUP_ID_PATTERN = /^S[A-Z0-9]+$/;
const MAX_RENDERED_USER_IDS = 5;
const USAGE_HINT =
  "Usage: slack usergroups get <usergroup-id(required,non-empty)> [usergroup-id ...] [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]";

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type UsergroupsGetHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackUsergroupsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: UsergroupsGetHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

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

const parseRequestedUsergroupIds = (positionals: string[]): string[] | CliResult => {
  if (positionals.length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "usergroups get requires at least one <usergroup-id>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const parsedIds: string[] = [];
  for (const positional of positionals) {
    const items = positional
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    for (const item of items) {
      if (!USERGROUP_ID_PATTERN.test(item)) {
        return createError(
          "INVALID_ARGUMENT",
          `Invalid usergroup id: ${item}.`,
          `Use Slack usergroup IDs like S123ABC45. ${USAGE_HINT}`,
          COMMAND_ID,
        );
      }

      parsedIds.push(item);
    }
  }

  return Array.from(new Set(parsedIds));
};

const isCliErrorResult = (value: string[] | CliResult): value is CliResult => {
  return typeof value === "object" && !Array.isArray(value) && "ok" in value;
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

export const createUsergroupsGetHandler = (
  depsOverrides: Partial<UsergroupsGetHandlerDeps> = {},
) => {
  const deps: UsergroupsGetHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const requestedIdsOrError = parseRequestedUsergroupIds(request.positionals);
    if (isCliErrorResult(requestedIdsOrError)) {
      return requestedIdsOrError;
    }
    const requestedIds = requestedIdsOrError;

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

      const requestedIdsSet = new Set(requestedIds);
      const filteredUsergroups = result.usergroups.filter((group) => requestedIdsSet.has(group.id));
      const resolvedIds = new Set(filteredUsergroups.map((group) => group.id));
      const missingIds = requestedIds.filter((id) => !resolvedIds.has(id));

      const textLines: string[] = [
        `Matched ${filteredUsergroups.length} user groups (requested ${requestedIds.length}).`,
        "",
      ];
      if (missingIds.length > 0) {
        textLines.push(`Missing user group ids: ${missingIds.join(", ")}`);
        textLines.push("");
      }
      if (filteredUsergroups.length === 0) {
        textLines.push("No matching user groups.");
      }

      for (const group of filteredUsergroups) {
        textLines.push(toGroupLine(group));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Fetched ${filteredUsergroups.length} user groups by id`,
        data: {
          usergroups: filteredUsergroups,
          count: filteredUsergroups.length,
          requested_ids: requestedIds,
          missing_ids: missingIds,
        },
        textLines,
      };
    } catch (error) {
      if (isSlackClientError(error)) {
        return mapSlackErrorToCliResult(error);
      }

      return createError(
        "INTERNAL_ERROR",
        "Unexpected usergroups.get failure",
        "Try again with --json for structured output.",
        COMMAND_ID,
      );
    }
  };
};

export const usergroupsGetHandler = createUsergroupsGetHandler();
