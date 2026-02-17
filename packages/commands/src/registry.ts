import { helpHandler } from "./handlers/help";
import { resourcesHandler } from "./handlers/resources";
import { channelsListHandler, messagesSearchHandler, usersListHandler } from "./handlers/stubs";
import { toolsHandler } from "./handlers/tools";
import { versionHandler } from "./handlers/version";
import type { CommandDefinition } from "./types";

export const COMMAND_REGISTRY: CommandDefinition[] = [
  {
    path: ["help"],
    handler: helpHandler,
  },
  {
    path: ["version"],
    handler: versionHandler,
  },
  {
    path: ["resources"],
    handler: resourcesHandler,
  },
  {
    path: ["tools"],
    handler: toolsHandler,
  },
  {
    path: ["channels", "list"],
    handler: channelsListHandler,
  },
  {
    path: ["users", "list"],
    handler: usersListHandler,
  },
  {
    path: ["messages", "search"],
    handler: messagesSearchHandler,
  },
];
