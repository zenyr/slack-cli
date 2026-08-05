import type { SlackWebApiClient } from "../slack/types";
import { createSlackClientError, isSlackClientError } from "../slack/utils";

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]+$/;

export const isChannelId = (value: string): boolean => CHANNEL_ID_RE.test(value);

export const resolveChannelReference = async (
  reference: string,
  client: Pick<SlackWebApiClient, "listChannels">,
): Promise<string> => {
  const trimmed = reference.trim();
  if (isChannelId(trimmed)) {
    return trimmed;
  }

  const name = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (name.length === 0 || name.includes("#") || /\s/.test(name)) {
    throw createSlackClientError({
      code: "SLACK_CONFIG_ERROR",
      message: `Invalid channel reference: ${reference}.`,
      hint: "Use a channel ID, #name, or bare channel name.",
    });
  }

  const scopeErrors: { needed?: string; provided?: string }[] = [];
  const channelTypes: ("public" | "private")[] = ["public", "private"];
  for (const type of channelTypes) {
    let cursor: string | undefined;
    try {
      do {
        const result = await client.listChannels({
          types: [type],
          limit: 200,
          cursor,
        });
        const match = result.channels.find(
          (channel) => channel.name.toLowerCase() === name.toLowerCase(),
        );
        if (match !== undefined) {
          return match.id;
        }
        cursor = result.nextCursor;
      } while (cursor !== undefined);
    } catch (error) {
      if (isSlackClientError(error) && error.code === "SLACK_API_ERROR" && error.needed) {
        scopeErrors.push({ needed: error.needed, provided: error.provided });
        continue;
      }
      throw error;
    }
  }

  if (scopeErrors.length > 0) {
    const needed = [...new Set(scopeErrors.flatMap((error) => error.needed?.split(",") ?? []))]
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0)
      .join(",");
    const provided = scopeErrors.find((error) => error.provided !== undefined)?.provided;
    throw createSlackClientError({
      code: "SLACK_API_ERROR",
      message: "Slack API request failed: missing_scope.",
      hint: `Channel name resolution requires Slack scope: ${needed}. Use a channel ID when the token can post but cannot list channels.`,
      details: needed,
      needed,
      provided,
    });
  }

  throw createSlackClientError({
    code: "SLACK_CONFIG_ERROR",
    message: `Channel name not found: #${name}.`,
    hint: "Name resolution requires channels:read for public channels or groups:read for private channels. Use a channel ID when the token can post but cannot list channels.",
  });
};
