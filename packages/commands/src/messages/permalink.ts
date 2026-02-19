const CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]{8,}$/;
const MESSAGE_POINTER_PATTERN = /^p(\d{7,})$/;

export type SlackMessagePermalinkParseResult =
  | {
      kind: "ok";
      channel: string;
      ts: string;
    }
  | {
      kind: "invalid";
      reason: string;
      hint: string;
    }
  | {
      kind: "not-permalink";
    };

const isLikelyUrl = (value: string): boolean => {
  return value.startsWith("http://") || value.startsWith("https://");
};

export const parseSlackMessagePermalink = (value: string): SlackMessagePermalinkParseResult => {
  const rawInput = value.trim();
  if (!isLikelyUrl(rawInput)) {
    return { kind: "not-permalink" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawInput);
  } catch {
    return {
      kind: "invalid",
      reason: "Malformed URL input.",
      hint: "Use Slack message permalink format: https://<workspace>.slack.com/archives/<channel-id>/p<message-ts>.",
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      kind: "invalid",
      reason: "Slack message URL must use https.",
      hint: "Use Slack message permalink format: https://<workspace>.slack.com/archives/<channel-id>/p<message-ts>.",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname.endsWith(".slack.com")) {
    return {
      kind: "invalid",
      reason: "Slack message URL host must end with .slack.com.",
      hint: "Use Slack message permalink format: https://<workspace>.slack.com/archives/<channel-id>/p<message-ts>.",
    };
  }

  const pathSegments = parsedUrl.pathname.split("/").filter((segment) => segment.length > 0);
  if (pathSegments.length !== 3 || pathSegments[0] !== "archives") {
    return {
      kind: "invalid",
      reason: "Unsupported Slack URL path.",
      hint: "Use Slack message permalink path: /archives/<channel-id>/p<message-ts>.",
    };
  }

  const channel = pathSegments[1];
  if (channel === undefined || !CHANNEL_ID_PATTERN.test(channel)) {
    return {
      kind: "invalid",
      reason: "Invalid Slack channel id in URL.",
      hint: "Use Slack channel ids like C12345678 in message permalink URLs.",
    };
  }

  const messagePointer = pathSegments[2];
  const pointerMatch =
    messagePointer === undefined ? undefined : MESSAGE_POINTER_PATTERN.exec(messagePointer);
  if (pointerMatch === undefined || pointerMatch === null) {
    return {
      kind: "invalid",
      reason: "Invalid Slack message pointer in URL.",
      hint: "Message permalink must end with p<message-ts> (example: p1700000000123456).",
    };
  }

  const packedTs = pointerMatch[1];
  if (packedTs === undefined || packedTs.length <= 6) {
    return {
      kind: "invalid",
      reason: "Invalid Slack message timestamp in URL.",
      hint: "Message permalink must include a timestamp with seconds and microseconds.",
    };
  }

  const secondsPart = packedTs.slice(0, -6);
  const microsPart = packedTs.slice(-6);

  return {
    kind: "ok",
    channel,
    ts: `${secondsPart}.${microsPart}`,
  };
};
