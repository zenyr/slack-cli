import { attachmentGetHandler } from "./handlers/attachment-get";
import { batchHandler } from "./handlers/batch";
import { channelsInfoHandler } from "./handlers/channels-info";
import { channelsJoinHandler } from "./handlers/channels-join";
import { channelsLeaveHandler } from "./handlers/channels-leave";
import { channelsSearchHandler } from "./handlers/channels-search";
import { helpHandler } from "./handlers/help";
import { messagesContextHandler } from "./handlers/messages-context";
import { messagesDeleteHandler } from "./handlers/messages-delete";
import { messagesFetchHandler } from "./handlers/messages-fetch";
import { messagesHistoryHandler } from "./handlers/messages-history";
import { messagesPinHandler } from "./handlers/messages-pin";
import { messagesPinsHandler } from "./handlers/messages-pins";
import { messagesPostHandler } from "./handlers/messages-post";
import { messagesPostEphemeralHandler } from "./handlers/messages-post-ephemeral";
import { messagesReplyHandler } from "./handlers/messages-reply";
import { messagesUnpinHandler } from "./handlers/messages-unpin";
import { messagesUpdateHandler } from "./handlers/messages-update";
import { reactionsAddHandler } from "./handlers/reactions-add";
import { reactionsListHandler } from "./handlers/reactions-list";
import { reactionsRemoveHandler } from "./handlers/reactions-remove";
import { resourcesHandler } from "./handlers/resources";
import {
  authCheckHandler,
  authLoginHandler,
  authLogoutHandler,
  authUseHandler,
  authWhoamiHandler,
  channelsListHandler,
  messagesRepliesHandler,
  messagesSearchHandler,
  usersGetHandler,
  usersListHandler,
  usersSearchHandler,
} from "./handlers/stubs";
import { toolsHandler } from "./handlers/tools";
import { usergroupsCreateHandler } from "./handlers/usergroups-create";
import { usergroupsGetHandler } from "./handlers/usergroups-get";
import { usergroupsListHandler } from "./handlers/usergroups-list";
import { usergroupsMeHandler } from "./handlers/usergroups-me";
import { usergroupsMeJoinHandler } from "./handlers/usergroups-me-join";
import { usergroupsMeLeaveHandler } from "./handlers/usergroups-me-leave";
import { usergroupsUpdateHandler } from "./handlers/usergroups-update";
import { usergroupsUsersUpdateHandler } from "./handlers/usergroups-users-update";
import { usersStatusClearHandler } from "./handlers/users-status-clear";
import { usersStatusGetHandler } from "./handlers/users-status-get";
import { usersStatusSetHandler } from "./handlers/users-status-set";
import { versionHandler } from "./handlers/version";
import type { CommandStrategy } from "./types";

export const COMMAND_REGISTRY: CommandStrategy[] = [
  {
    id: "batch",
    path: ["batch"],
    execute: batchHandler,
  },
  {
    id: "help",
    path: ["help"],
    execute: helpHandler,
  },
  {
    id: "version",
    path: ["version"],
    execute: versionHandler,
  },
  {
    id: "resources",
    path: ["resources"],
    execute: resourcesHandler,
  },
  {
    id: "tools",
    path: ["tools"],
    execute: toolsHandler,
  },
  {
    id: "auth-check",
    path: ["auth", "check"],
    execute: authCheckHandler,
  },
  {
    id: "auth-whoami",
    path: ["auth", "whoami"],
    execute: authWhoamiHandler,
  },
  {
    id: "auth-login",
    path: ["auth", "login"],
    execute: authLoginHandler,
  },
  {
    id: "auth-logout",
    path: ["auth", "logout"],
    execute: authLogoutHandler,
  },
  {
    id: "auth-use",
    path: ["auth", "use"],
    execute: authUseHandler,
  },
  {
    id: "channels-list",
    path: ["channels", "list"],
    execute: channelsListHandler,
  },
  {
    id: "channels-info",
    path: ["channels", "info"],
    execute: channelsInfoHandler,
  },
  {
    id: "channels-search",
    path: ["channels", "search"],
    execute: channelsSearchHandler,
  },
  {
    id: "channels-join",
    path: ["channels", "join"],
    execute: channelsJoinHandler,
  },
  {
    id: "channels-leave",
    path: ["channels", "leave"],
    execute: channelsLeaveHandler,
  },
  {
    id: "users-list",
    path: ["users", "list"],
    execute: usersListHandler,
  },
  {
    id: "users-get",
    path: ["users", "get"],
    execute: usersGetHandler,
  },
  {
    id: "users-search",
    path: ["users", "search"],
    execute: usersSearchHandler,
  },
  {
    id: "users-status-get",
    path: ["users", "status", "get"],
    execute: usersStatusGetHandler,
  },
  {
    id: "users-status-set",
    path: ["users", "status", "set"],
    execute: usersStatusSetHandler,
  },
  {
    id: "users-status-clear",
    path: ["users", "status", "clear"],
    execute: usersStatusClearHandler,
  },
  {
    id: "attachment-get",
    path: ["attachment", "get"],
    execute: attachmentGetHandler,
  },
  {
    id: "usergroups-list",
    path: ["usergroups", "list"],
    execute: usergroupsListHandler,
  },
  {
    id: "usergroups-get",
    path: ["usergroups", "get"],
    execute: usergroupsGetHandler,
  },
  {
    id: "usergroups-create",
    path: ["usergroups", "create"],
    execute: usergroupsCreateHandler,
  },
  {
    id: "usergroups-me-list",
    path: ["usergroups", "me", "list"],
    execute: usergroupsMeHandler,
  },
  {
    id: "usergroups-me-join",
    path: ["usergroups", "me", "join"],
    execute: usergroupsMeJoinHandler,
  },
  {
    id: "usergroups-me-leave",
    path: ["usergroups", "me", "leave"],
    execute: usergroupsMeLeaveHandler,
  },
  {
    id: "usergroups-update",
    path: ["usergroups", "update"],
    execute: usergroupsUpdateHandler,
  },
  {
    id: "usergroups-users-update",
    path: ["usergroups", "users", "update"],
    execute: usergroupsUsersUpdateHandler,
  },
  {
    id: "messages-search",
    path: ["messages", "search"],
    execute: messagesSearchHandler,
  },
  {
    id: "messages-fetch",
    path: ["messages", "fetch"],
    execute: messagesFetchHandler,
  },
  {
    id: "messages-history",
    path: ["messages", "history"],
    execute: messagesHistoryHandler,
  },
  {
    id: "messages-context",
    path: ["messages", "context"],
    execute: messagesContextHandler,
  },
  {
    id: "messages-post",
    path: ["messages", "post"],
    execute: messagesPostHandler,
  },
  {
    id: "messages-post-ephemeral",
    path: ["messages", "post-ephemeral"],
    execute: messagesPostEphemeralHandler,
  },
  {
    id: "messages-delete",
    path: ["messages", "delete"],
    execute: messagesDeleteHandler,
  },
  {
    id: "messages-update",
    path: ["messages", "update"],
    execute: messagesUpdateHandler,
  },
  {
    id: "messages-reply",
    path: ["messages", "reply"],
    execute: messagesReplyHandler,
  },
  {
    id: "messages-replies",
    path: ["messages", "replies"],
    execute: messagesRepliesHandler,
  },
  {
    id: "messages-pin",
    path: ["messages", "pin"],
    execute: messagesPinHandler,
  },
  {
    id: "messages-unpin",
    path: ["messages", "unpin"],
    execute: messagesUnpinHandler,
  },
  {
    id: "messages-pins",
    path: ["messages", "pins"],
    execute: messagesPinsHandler,
  },
  {
    id: "reactions-add",
    path: ["reactions", "add"],
    execute: reactionsAddHandler,
  },
  {
    id: "reactions-remove",
    path: ["reactions", "remove"],
    execute: reactionsRemoveHandler,
  },
  {
    id: "reactions-list",
    path: ["reactions", "list"],
    execute: reactionsListHandler,
  },
];
