import { helpHandler } from "./handlers/help";
import { resourcesHandler } from "./handlers/resources";
import { channelsListHandler, messagesSearchHandler, usersListHandler } from "./handlers/stubs";
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
];
