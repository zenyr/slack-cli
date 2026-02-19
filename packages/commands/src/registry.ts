import { attachmentGetHandler } from "./handlers/attachment-get";
import { helpHandler } from "./handlers/help";
import { messagesDeleteHandler } from "./handlers/messages-delete";
import { messagesFetchHandler } from "./handlers/messages-fetch";
import { messagesHistoryHandler } from "./handlers/messages-history";
import { messagesPostHandler } from "./handlers/messages-post";
import { messagesPostEphemeralHandler } from "./handlers/messages-post-ephemeral";
import { messagesUpdateHandler } from "./handlers/messages-update";
import { reactionsAddHandler } from "./handlers/reactions-add";
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
import { usergroupsListHandler } from "./handlers/usergroups-list";
import { usergroupsMeHandler } from "./handlers/usergroups-me";
import { usergroupsMeJoinHandler } from "./handlers/usergroups-me-join";
import { usergroupsMeLeaveHandler } from "./handlers/usergroups-me-leave";
import { usergroupsUpdateHandler } from "./handlers/usergroups-update";
import { usergroupsUsersUpdateHandler } from "./handlers/usergroups-users-update";
import { versionHandler } from "./handlers/version";
import type { CommandStrategy } from "./types";

export const COMMAND_REGISTRY: CommandStrategy[] = [
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
    id: "messages-replies",
    path: ["messages", "replies"],
    execute: messagesRepliesHandler,
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
];
