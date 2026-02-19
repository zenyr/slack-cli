import type { SlackMessage, SlackUser, SlackUsersInfoWebApiClient } from "../slack/types";

export type UserLookup = Map<string, SlackUser>;

export type ResolvedUsersResult = {
  lookup: UserLookup;
  resolvedUsers: Record<string, { username: string; displayName?: string }>;
  missingUserIds: string[];
};

/**
 * Collect unique user IDs from messages and batch-resolve via users.info.
 * Returns a lookup map, a serializable record for JSON output, and missing IDs.
 */
export const resolveUserIds = async (
  client: SlackUsersInfoWebApiClient,
  messages: SlackMessage[],
): Promise<ResolvedUsersResult> => {
  const uniqueIds = Array.from(
    new Set(
      messages.map((m) => m.user).filter((id): id is string => id !== undefined && id.length > 0),
    ),
  );

  if (uniqueIds.length === 0) {
    return { lookup: new Map(), resolvedUsers: {}, missingUserIds: [] };
  }

  const result = await client.getUsersByIds(uniqueIds);
  const lookup: UserLookup = new Map();
  const resolvedUsers: Record<string, { username: string; displayName?: string }> = {};

  for (const user of result.users) {
    lookup.set(user.id, user);
    resolvedUsers[user.id] = {
      username: user.username,
      displayName: user.displayName,
    };
  }

  return { lookup, resolvedUsers, missingUserIds: result.missingUserIds };
};

/**
 * Format a user ID for human-readable display.
 * If resolved: "displayName (@username)" or "@username" if no displayName.
 * If unresolved: raw ID.
 */
export const formatUser = (userId: string | undefined, lookup: UserLookup): string => {
  if (userId === undefined) {
    return "unknown";
  }

  const user = lookup.get(userId);
  if (user === undefined) {
    return userId;
  }

  if (user.displayName !== undefined && user.displayName.length > 0) {
    return `${user.displayName} (@${user.username})`;
  }

  return `@${user.username}`;
};
