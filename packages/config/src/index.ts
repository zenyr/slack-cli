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
  examples?: string[];
  mcpTools?: string[];
};

export const CLI_NAME = "slack";

export const COMMANDS: CliCommand[] = [
  {
    name: "help",
    args: "",
    description: "Show this help message",
  },
  {
    name: "schema",
    args: "[<command> [subcommand ...]] [--json]",
    description: "Show machine-readable command schema metadata",
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
    args: "[--type <public|private|im|mpim>] [--sort <name|popularity>] [--query=<text>] [--query-targets=<name,topic,purpose>] [--limit <n>] [--cursor <cursor>] [--json]",
    description: "List channels",
  },
  {
    name: "channels me",
    args: "[--type <public|private|im|mpim>] [--limit <n>] [--cursor <cursor>] [--json]",
    description: "List channels you belong to",
  },
  {
    name: "channels info",
    args: "<channel-id|#name|name> [--json]",
    description: "Get channel info by ID or name",
  },
  {
    name: "channels search",
    args: "<query> | --query=<text> [--type <public|private|im|mpim>] [--json]",
    description: "Search channels by name",
    examples: ['slack channels search "project-alpha"'],
  },
  {
    name: "channels join",
    args: "<channel-id> [--json]",
    description: "Join a channel (xoxp only)",
  },
  {
    name: "channels leave",
    args: "<channel-id> [--json]",
    description: "Leave a channel (xoxp only)",
  },
  {
    name: "users list",
    args: "[<query>] [--cursor=<cursor>] [--limit=<n>] [--json]",
    description: "List users",
  },
  {
    name: "users get",
    args: "<user-id> [user-id ...] [--json]",
    description: "Get users by ID (batch supported)",
  },
  {
    name: "users search",
    args: "<query(required,non-empty)> [--cursor=<cursor>] [--limit=<n>] [--json]",
    description: "Search users",
    examples: ['slack users search "Jane Doe"'],
    mcpTools: ["users_search"],
  },
  {
    name: "users status get",
    args: "[user-id] [--json]",
    description: "Get user status",
  },
  {
    name: "users status set",
    args: "<emoji> <text> [--expiration=<30m|1h|2h|4h|today|unix-ts>] [--json]",
    description: "Set user status (xoxp only)",
  },
  {
    name: "users status clear",
    args: "[--json]",
    description: "Clear user status (xoxp only)",
  },
  {
    name: "attachment get",
    args: "<file-id> [--content[=<bool>]] [--save[=<bool>]] [--json]",
    description: "Get attachment metadata, content, or saved file by file id",
  },
  {
    name: "usergroups list",
    args: "[--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]",
    description: "List user groups",
  },
  {
    name: "usergroups get",
    args: "<usergroup-id> [usergroup-id ...] [--include-users[=<bool>]] [--include-disabled[=<bool>]] [--include-count[=<bool>]] [--json]",
    description: "Get user groups by ID (batch supported)",
  },
  {
    name: "usergroups create",
    args: "<name(required,non-empty)> [--handle=<handle>] [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
    description: "Create user group",
  },
  {
    name: "usergroups me list",
    args: "[--json]",
    description: "List current user memberships in user groups",
  },
  {
    name: "usergroups me join",
    args: "<usergroup-id(required,non-empty)> [--json]",
    description: "Join current user to a user group",
  },
  {
    name: "usergroups me leave",
    args: "<usergroup-id(required,non-empty)> [--json]",
    description: "Remove current user from a user group",
  },
  {
    name: "usergroups update",
    args: "<usergroup-id(required,non-empty)> [--name=<name>] [--handle=<handle>] [--description=<text>] [--channels=<comma-separated-channel-ids>] [--json]",
    description: "Update user group metadata",
  },
  {
    name: "usergroups users update",
    args: "<usergroup-id(required,non-empty)> <user-id(required,non-empty)> [user-id ...] --yes [--json]",
    description: "Replace user group members",
  },
  {
    name: "messages search",
    args: "<query> [--channel <value>] [--im <value>] [--with <value>] [--user <value>] [--after <YYYY-MM-DD|1d|1w|30d|90d>] [--before <YYYY-MM-DD|1d|1w|30d|90d>] [--on <YYYY-MM-DD|1d|1w|30d|90d>] [--during <period>] [--threads] [--limit=<n>] [--cursor=<page>] [--json]",
    description: "Search messages",
    examples: ['slack messages search "deployment failed" --after=1d --limit=20'],
    mcpTools: ["conversations_search_messages"],
  },
  {
    name: "messages fetch",
    args: "<message-url> [--thread[=<bool>]] [--resolve-users[=<bool>]] [--json]",
    description: "Fetch message by permalink URL (optionally include thread)",
  },
  {
    name: "messages history",
    args: "<channel-id> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--resolve-users[=<bool>]] [--json]",
    description: "Fetch channel message history",
  },
  {
    name: "messages context",
    args: "<message-url> [--before=<n>] [--after=<n>] [--resolve-users[=<bool>]] [--json]",
    description: "Fetch messages surrounding a permalink",
  },
  {
    name: "messages post",
    args: "<channel-id|#name|name> <text|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|-|@file>] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--reply-broadcast[=<bool>]] [--json]",
    description:
      "Post message to channel (payload text optional only with non-empty blocks; markdown auto-converted to mrkdwn)",
    examples: ['slack messages post C123 "Hello" --dry-run --xoxb'],
    mcpTools: ["conversations_add_message"],
  },
  {
    name: "messages post-ephemeral",
    args: "<channel-id> <user-id> <text|-> [--thread-ts=<ts>] [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]",
    description: "Post ephemeral message to channel user",
  },
  {
    name: "messages delete",
    args: "<message-url> [--json] OR <channel-id> <timestamp> [--json]",
    description: "Delete message by URL or channel and timestamp",
  },
  {
    name: "messages update",
    args: "<message-url> <text|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json] OR <channel-id> <timestamp> <text|-> [--blocks[=<json|bool|->]] [--payload=<json|->] [--dry-run[=<bool>]] [--json]",
    description: "Update message text by URL or channel and timestamp",
  },
  {
    name: "messages reply",
    args: "<channel-id|#name|name|permalink> <thread-ts> <text|-> [--blocks[=<json|bool|->]] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--reply-broadcast[=<bool>]] [--unfurl-links[=<bool>]] [--unfurl-media[=<bool>]] [--json] OR <thread-permalink> <text|-> [--blocks[=<json|bool|->]] [--payload-out=<file> --dry-run] [--dry-run[=<bool>]] [--reply-broadcast[=<bool>]] [--json]",
    description: "Reply to thread by channel+ts or thread permalink",
  },
  {
    name: "messages replies",
    args: "<channel-id(required,non-empty)> <thread-ts(required,non-empty)> OR <thread-permalink(required,non-empty)> [--oldest=<ts>] [--latest=<ts>] [--limit=<n>] [--cursor=<cursor>] [--include-activity] [--resolve-users[=<bool>]] [--json]",
    description: "Fetch full thread by channel+thread timestamp or thread permalink",
  },
  {
    name: "messages unreads",
    args: "[--include-messages[=<bool>]] [--channel-types=<all|dm|group_dm|partner|internal>] [--max-channels=<n>] [--max-messages-per-channel=<n>] [--mentions-only[=<bool>]] [--include-muted[=<bool>]] [--json]",
    description: "Get unread messages across channels (xoxp fallback mode)",
  },
  {
    name: "messages mark",
    args: "<channel-id(required,non-empty)> [--ts=<timestamp>] [--json]",
    description: "Mark a channel or DM as read (requires SLACK_MCP_MARK_TOOL=true)",
  },
  {
    name: "messages pin",
    args: "<channel-id> <timestamp> [--json]",
    description: "Pin a message",
  },
  {
    name: "messages unpin",
    args: "<channel-id> <timestamp> [--json]",
    description: "Unpin a message",
  },
  {
    name: "messages pins",
    args: "<channel-id> [--json]",
    description: "List pinned messages in channel",
  },
  {
    name: "views publish",
    args: "<user-id(required,non-empty)> --view=<json|-> [--hash=<hash>] [--payload=<json|->] [--dry-run[=<bool>]] [--json]",
    description: "Publish or update a user's App Home view",
  },
  {
    name: "views clear",
    args: "<user-id(required,non-empty)> [--dry-run[=<bool>]] [--json]",
    description: "Clear a user's App Home view by publishing an empty Home view",
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
    name: "reactions list",
    args: "<channel-id> <timestamp> [--json]",
    description: "List reactions on a message",
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
    name: "batch",
    args: '"<command arg...>" ["<command arg...>" ...] [--stop-on-error[=<bool>]] [--fail-on-error[=<bool>]] [--json]',
    description: "Run multiple commands in one process",
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
  "reactions_add",
  "reactions_remove",
  "attachment_get_data",
  "conversations_search_messages",
  "conversations_unreads",
  "conversations_mark",
  "conversations_leave",
  "conversations_join",
  "channels_list",
  "channels_me",
  "usergroups_list",
  "usergroups_me",
  "usergroups_create",
  "usergroups_update",
  "usergroups_users_update",
  "users_search",
  "saved_list",
  "saved_update",
  "saved_clear_completed",
];
