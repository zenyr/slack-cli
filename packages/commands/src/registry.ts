import { helpHandler } from "./handlers/help";
import { messagesHistoryHandler } from "./handlers/messages-history";
import { messagesPostHandler } from "./handlers/messages-post";
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
  usersListHandler,
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
