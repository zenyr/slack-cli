import { resolveTokenForContext } from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackChannelInfoWebApiClient } from "../slack/types";
import { isSlackClientError } from "../slack/utils";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "channels.info";
const USAGE_HINT = "Usage: slack channels info <channel-id(required,non-empty)> [--json]";

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]+$/;

type CreateClientOptions = {
  token?: string;
  env?: Record<string, string | undefined>;
};

type ChannelsInfoHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackChannelInfoWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ChannelsInfoHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const mapSlackClientError = (error: unknown): CliResult => {
  if (!isSlackClientError(error)) {
    return createError(
      "INTERNAL_ERROR",
      "Unexpected runtime failure for channels.info.",
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

export const createChannelsInfoHandler = (depsOverrides: Partial<ChannelsInfoHandlerDeps> = {}) => {
  const deps: ChannelsInfoHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const rawChannelId = request.positionals[0];
    if (rawChannelId === undefined || rawChannelId.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "channels info requires <channel-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
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
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const result = await client.fetchChannelInfo(channelId);
      const { channel } = result;

      const visibility = channel.isPrivate ? "private" : "public";
      const archiveStatus = channel.isArchived ? "archived" : "active";
      const memberCountLabel =
        channel.memberCount === undefined ? "members n/a" : `${channel.memberCount} members`;

      const textLines: string[] = [
        `#${channel.name} (${channel.id}) - ${visibility}, ${archiveStatus}, ${memberCountLabel}`,
      ];

      if (channel.topic !== undefined && channel.topic.length > 0) {
        textLines.push(`Topic: ${channel.topic}`);
      }

      if (channel.purpose !== undefined && channel.purpose.length > 0) {
        textLines.push(`Purpose: ${channel.purpose}`);
      }

      const metaParts: string[] = [];
      if (channel.creator !== undefined) {
        metaParts.push(`Creator: ${channel.creator}`);
      }
      if (channel.created !== undefined) {
        metaParts.push(`Created: ${channel.created}`);
      }
      if (metaParts.length > 0) {
        textLines.push(metaParts.join(" | "));
      }

      return {
        ok: true,
        command: COMMAND_ID,
        data: { channel },
        textLines,
      };
    } catch (error) {
      return mapSlackClientError(error);
    }
  };
};

export const channelsInfoHandler = createChannelsInfoHandler();
