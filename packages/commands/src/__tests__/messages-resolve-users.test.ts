import { describe, expect, test } from "bun:test";

import { isRecord } from "./test-utils";
import { createMessagesContextHandler } from "../handlers/messages-context";
import { createMessagesFetchHandler } from "../handlers/messages-fetch";
import { createMessagesHistoryHandler } from "../handlers/messages-history";
import { createMessagesRepliesHandler } from "../handlers/messages-replies";
import type { SlackMessage, SlackUser } from "../slack/types";
import type { CommandRequest } from "../types";

const message: SlackMessage = {
  type: "message",
  user: "U123",
  text: "hello",
  ts: "1700000000.123456",
};

const user: SlackUser = {
  id: "U123",
  username: "alice",
  displayName: "Alice",
  isBot: false,
  isDeleted: false,
  isAdmin: false,
};

const createRequest = (
  command: string,
  positionals: string[],
  options: Record<string, string | boolean> = { "resolve-users": true },
): CommandRequest => ({
  commandPath: ["messages", command],
  positionals,
  options,
  flags: {
    json: true,
    help: false,
    version: false,
    xoxp: false,
    xoxb: false,
  },
  context: { version: "1.2.3" },
});

const expectResolvedOutput = (
  result: Awaited<ReturnType<ReturnType<typeof createMessagesFetchHandler>>>,
) => {
  expect(result.ok).toBe(true);
  if (!result.ok || !isRecord(result.data)) {
    return;
  }

  expect(
    result.textLines?.some((line) => line.endsWith("1700000000.123456 Alice (@alice) hello")),
  ).toBe(true);
  expect(isRecord(result.data.resolvedUsers)).toBe(true);
  if (!isRecord(result.data.resolvedUsers)) {
    return;
  }

  expect(result.data.resolvedUsers.U123).toEqual({
    username: "alice",
    displayName: "Alice",
  });
};

describe("messages --resolve-users", () => {
  test("resolves fetch message author", async () => {
    const requestedUserIds: string[][] = [];
    const handler = createMessagesFetchHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({ channel: "C12345678", messages: [message] }),
        fetchMessageReplies: async () => ({ channel: "C12345678", messages: [message] }),
        getUsersByIds: async (userIds) => {
          requestedUserIds.push(userIds);
          return { users: [user], missingUserIds: [] };
        },
      }),
    });

    const result = await handler(
      createRequest("fetch", ["https://acme.slack.com/archives/C12345678/p1700000000123456"]),
    );

    expect(requestedUserIds).toEqual([["U123"]]);
    expectResolvedOutput(result);
  });

  test("resolves history message authors once per unique id", async () => {
    const requestedUserIds: string[][] = [];
    const handler = createMessagesHistoryHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({
          channel: "C123",
          messages: [message, { ...message, ts: "1700000001.123456" }],
        }),
        getUsersByIds: async (userIds) => {
          requestedUserIds.push(userIds);
          return { users: [user], missingUserIds: [] };
        },
      }),
    });

    const result = await handler(createRequest("history", ["C123"]));

    expect(requestedUserIds).toEqual([["U123"]]);
    expectResolvedOutput(result);
  });

  test("resolves context message authors after merging results", async () => {
    const requestedUserIds: string[][] = [];
    const handler = createMessagesContextHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        listChannels: async () => ({ channels: [] }),
        listUsers: async () => ({ users: [] }),
        searchMessages: async () => ({ query: "", total: 0, messages: [] }),
        fetchChannelHistory: async () => ({ channel: "C12345678", messages: [message] }),
        getUsersByIds: async (userIds) => {
          requestedUserIds.push(userIds);
          return { users: [user], missingUserIds: [] };
        },
      }),
    });

    const result = await handler(
      createRequest("context", ["https://acme.slack.com/archives/C12345678/p1700000000123456"]),
    );

    expect(requestedUserIds).toEqual([["U123"]]);
    expectResolvedOutput(result);
  });

  test("resolves replies message authors", async () => {
    const requestedUserIds: string[][] = [];
    const handler = createMessagesRepliesHandler({
      env: {},
      resolveToken: () => ({ token: "xoxp-test", source: "SLACK_MCP_XOXP_TOKEN" }),
      createClient: () => ({
        fetchMessageReplies: async () => ({ channel: "C123", messages: [message] }),
        getUsersByIds: async (userIds) => {
          requestedUserIds.push(userIds);
          return { users: [user], missingUserIds: [] };
        },
      }),
    });

    const result = await handler(createRequest("replies", ["C123", "1700000000.123456"]));

    expect(requestedUserIds).toEqual([["U123"]]);
    expectResolvedOutput(result);
  });
});
