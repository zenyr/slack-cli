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
    args: "[<query>] [--cursor=<cursor>] [--limit=<n>] [--json]",
    description: "List users",
  },
  {
    name: "users search",
    args: "[<query>] [--cursor=<cursor>] [--limit=<n>] [--json]",
    description: "Search users",
  },
  {
    name: "attachment get",
    args: "<file-id> [--json]",
    description: "Get attachment metadata by file id",
  },
  {
    name: "usergroups list",
    args: "[--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]",
    description: "List user groups",
  },
  {
    name: "usergroups create",
    args: "<name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
    description: "Create user group",
  },
  {
    name: "usergroups me list",
    args: "[--json]",
    description: "List current user memberships in user groups",
  },
  {
    name: "usergroups me join",
    args: "<usergroup-id> [--json]",
    description: "Join current user to a user group",
  },
  {
    name: "usergroups me leave",
    args: "<usergroup-id> [--json]",
    description: "Remove current user from a user group",
  },
  {
    name: "usergroups update",
    args: "<usergroup-id> <name> <handle> [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
    description: "Update user group metadata",
  },
  {
    name: "usergroups users update",
    args: "<usergroup-id> <user-id> [user-id ...] --yes [--json]",
    description: "Replace user group members",
  },
  {
    name: "messages search",
    args: "<query> [--channel <value>] [--user <value>] [--after <YYYY-MM-DD|1d|1w|30d|90d>] [--before <YYYY-MM-DD|1d|1w|30d|90d>] [--threads] [--json]",
    description: "Search messages",
  },
  {
    name: "messages fetch",
    args: "<message-url> [--thread[=<bool>]] [--json]",
    description: "Fetch one message or full thread from permalink",
  },
  {
    name: "messages history",
    args: "<channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--json]",
    description: "Fetch channel message history",
  },
  {
    name: "messages post",
    args: "<channel-id> <text> [--thread-ts=<ts>] [--blocks[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]",
    description: "Post message to channel (markdown auto-converted to mrkdwn)",
  },
  {
    name: "messages post-ephemeral",
    args: "<channel-id> <user-id> <text> [--thread-ts=<ts>] [--json]",
    description: "Post ephemeral message to channel user",
  },
  {
    name: "messages delete",
    args: "<message-url> [--json] OR <channel-id> <timestamp> [--json]",
    description: "Delete message by URL or channel and timestamp",
  },
  {
    name: "messages update",
    args: "<message-url> <text> [--json] OR <channel-id> <timestamp> <text> [--json]",
    description: "Update message text by URL or channel and timestamp",
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
  "attachment_get_data",
  "users_search",
  "usergroups_list",
  "usergroups_create",
  "usergroups_update",
  "usergroups_users_update",
  "usergroups_me",
];
