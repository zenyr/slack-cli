import { helpHandler } from "./handlers/help";
import { messagesHistoryHandler } from "./handlers/messages-history";
import { messagesPostHandler } from "./handlers/messages-post";
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
];
