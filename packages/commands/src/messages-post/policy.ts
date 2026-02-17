const ALLOWLIST_ENV_KEY = "SLACK_MCP_POST_CHANNEL_ALLOWLIST";
const DENYLIST_ENV_KEY = "SLACK_MCP_POST_CHANNEL_DENYLIST";

type PostChannelPolicyResult = {
  allowed: boolean;
  reason?: string;
};

const SLACK_CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]+$/;

const isValidChannelId = (value: string): boolean => {
  return SLACK_CHANNEL_ID_PATTERN.test(value);
};

const parseChannelList = (value: string | undefined): string[] => {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const findFirstInvalidChannelId = (channelIds: string[]): string | undefined => {
  return channelIds.find((channelId) => isValidChannelId(channelId) === false);
};

export const evaluatePostChannelPolicy = (
  channelId: string,
  env: Record<string, string | undefined>,
): PostChannelPolicyResult => {
  const normalizedChannelId = channelId.trim();
  if (normalizedChannelId.length === 0 || isValidChannelId(normalizedChannelId) === false) {
    return {
      allowed: false,
      reason: `invalid channel id: ${channelId}`,
    };
  }

  const denylist = parseChannelList(env[DENYLIST_ENV_KEY]);
  const invalidDenylistChannel = findFirstInvalidChannelId(denylist);
  if (invalidDenylistChannel !== undefined) {
    return {
      allowed: false,
      reason: `invalid denylist channel id: ${invalidDenylistChannel}`,
    };
  }

  const allowlist = parseChannelList(env[ALLOWLIST_ENV_KEY]);
  const invalidAllowlistChannel = findFirstInvalidChannelId(allowlist);
  if (invalidAllowlistChannel !== undefined) {
    return {
      allowed: false,
      reason: `invalid allowlist channel id: ${invalidAllowlistChannel}`,
    };
  }

  if (denylist.includes(normalizedChannelId)) {
    return {
      allowed: false,
      reason: `channel denied by ${DENYLIST_ENV_KEY}`,
    };
  }

  if (allowlist.length > 0 && allowlist.includes(normalizedChannelId) === false) {
    return {
      allowed: false,
      reason: `channel not allowed by ${ALLOWLIST_ENV_KEY}`,
    };
  }

  return { allowed: true };
};
