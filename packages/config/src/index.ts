export type CliResource = {
  uri: string;
  title: string;
  format: "text/csv" | "application/json";
  description: string;
};

export type CliCommand = {
  name: string;
  args: string;
  description: string;
};

export const CLI_NAME = "slack";

export const COMMANDS: CliCommand[] = [
  {
    name: "help",
    args: "",
    description: "Show this help message",
  },
  {
    name: "auth check",
    args: "[--json]",
    description: "Check current auth session status",
  },
  {
    name: "auth whoami",
    args: "[--json]",
    description: "Show active authenticated identity",
  },
  {
    name: "auth login",
    args: "--type <xoxp|xoxb> [--token <token>] [--json]",
    description: "Store Slack token (via --token or stdin) and activate selected type",
  },
  {
    name: "auth logout",
    args: "[--json]",
    description: "Clear active auth session",
  },
  {
    name: "auth use",
    args: "<xoxp|xoxb> [--json]",
    description: "Switch active auth token type",
  },
  {
    name: "channels list",
    args: "[--type <public|private|im|mpim>] [--sort <name|popularity>] [--limit <n>] [--cursor <cursor>] [--json]",
    description: "List channels",
  },
  {
    name: "users list",
    args: "[<query>] [--json]",
    description: "List users",
  },
  {
    name: "usergroups list",
    args: "[--json]",
    description: "List user groups",
  },
  {
    name: "usergroups create",
    args: "<name> <handle> [--json]",
    description: "Create user group",
  },
  {
    name: "usergroups update",
    args: "<usergroup-id> <name> <handle> [--json]",
    description: "Update user group metadata",
  },
  {
    name: "messages search",
    args: "<query> [--channel <value>] [--user <value>] [--after YYYY-MM-DD] [--before YYYY-MM-DD] [--threads] [--json]",
    description: "Search messages",
  },
  {
    name: "messages history",
    args: "<channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--json]",
    description: "Fetch channel message history",
  },
  {
    name: "messages post",
    args: "<channel-id> <text> [--thread-ts=<ts>] [--json]",
    description: "Post plain text message to channel",
  },
  {
    name: "messages replies",
    args: "<channel-id> <thread-ts> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--json]",
    description: "Fetch thread message replies",
  },
  {
    name: "reactions add",
    args: "<channel-id> <timestamp> <emoji-name> [--json]",
    description: "Add reaction emoji to message",
  },
  {
    name: "reactions remove",
    args: "<channel-id> <timestamp> <emoji-name> [--json]",
    description: "Remove reaction emoji from message",
  },
  {
    name: "resources",
    args: "[--json]",
    description: "List available Slack MCP-style resources",
  },
  {
    name: "tools",
    args: "[--json]",
    description: "List referenced MCP tools from spec",
  },
  {
    name: "version",
    args: "",
    description: "Print CLI version",
  },
];

export const RESOURCES: CliResource[] = [
  {
    uri: "slack://<workspace>/channels",
    title: "Directory of Channels",
    format: "text/csv",
    description: "List channels, DMs, group DMs with basic metadata",
  },
  {
    uri: "slack://<workspace>/users",
    title: "Directory of Users",
    format: "text/csv",
    description: "List workspace users for lookups and context enrichment",
  },
];

export const TOOLS = [
  "conversations_history",
  "conversations_replies",
  "conversations_add_message",
  "conversations_search_messages",
  "channels_list",
  "reactions_add",
  "reactions_remove",
  "users_search",
  "usergroups_list",
  "usergroups_create",
  "usergroups_update",
  "usergroups_users_update",
  "usergroups_me",
];
