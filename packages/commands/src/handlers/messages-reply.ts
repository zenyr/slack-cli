import { createMessagesPostHandler } from "./messages-post";
import { isCliErrorResult, isValidSlackTimestamp } from "./messages-shared";
import { createError } from "../errors";
import { parseSlackMessagePermalink } from "../messages/permalink";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "messages.reply";
const USAGE_HINT =
  "Usage: slack messages reply <channel-id-or-permalink> <thread-ts> <text> [--blocks[=<json|bool>]] [--reply-broadcast[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--json]\n" +
  "       slack messages reply <thread-permalink> <text> [--blocks[=<json|bool>]] [--reply-broadcast[=<bool>]] [--json]";

type ResolvedReplyTarget = {
  channelId: string;
  threadTs: string;
  text: string;
};

const resolveReplyTarget = (positionals: string[]): ResolvedReplyTarget | CliResult => {
  const first = positionals[0];
  if (first === undefined || first.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages reply requires <channel-id-or-permalink>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (first.startsWith("http://") || first.startsWith("https://")) {
    const parsed = parseSlackMessagePermalink(first.trim());

    if (parsed.kind === "not-permalink") {
      return createError(
        "INVALID_ARGUMENT",
        "messages reply: URL provided but not a valid Slack permalink.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (parsed.kind === "invalid") {
      return createError("INVALID_ARGUMENT", parsed.reason, parsed.hint, COMMAND_ID);
    }

    const threadTs = parsed.threadTs ?? parsed.ts;

    const text = positionals.slice(1).join(" ");
    if (text.trim().length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "messages reply requires non-empty <text>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    return { channelId: parsed.channel, threadTs, text };
  }

  const channelId = first.trim();

  const rawThreadTs = positionals[1];
  if (rawThreadTs === undefined || rawThreadTs.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages reply requires <thread-ts>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const threadTs = rawThreadTs.trim();
  if (!isValidSlackTimestamp(threadTs)) {
    return createError(
      "INVALID_ARGUMENT",
      `messages reply <thread-ts> must match Slack timestamp format seconds.fraction. Received: ${threadTs}`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const text = positionals.slice(2).join(" ");
  if (text.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "messages reply requires non-empty <text>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return { channelId, threadTs, text };
};

export const createMessagesReplyHandler = (
  depsOverrides: Parameters<typeof createMessagesPostHandler>[0] = {},
) => {
  const postHandler = createMessagesPostHandler(depsOverrides);

  return async (request: CommandRequest): Promise<CliResult> => {
    const targetOrError = resolveReplyTarget(request.positionals);
    if (isCliErrorResult(targetOrError)) {
      return targetOrError;
    }

    const { channelId, threadTs, text } = targetOrError;
    const delegatedRequest: CommandRequest = {
      ...request,
      commandPath: ["messages", "post"],
      positionals: [channelId, text],
      options: {
        ...request.options,
        "thread-ts": threadTs,
      },
    };

    const result = await postHandler(delegatedRequest);
    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      command: COMMAND_ID,
      message: `Reply posted in thread ${threadTs}.`,
      textLines: [`Posted reply to ${channelId} thread ${threadTs}.`],
      data:
        typeof result.data === "object" && result.data !== null
          ? { ...result.data, thread_ts: threadTs }
          : result.data,
    };
  };
};

export const messagesReplyHandler = createMessagesReplyHandler();
