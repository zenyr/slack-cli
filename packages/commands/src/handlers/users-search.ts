import { createUsersListHandler } from "./users-list";

export const createUsersSearchHandler = () => {
  return createUsersListHandler({
    commandId: "users.search",
    commandLabel: "users search",
  });
};

export const usersSearchHandler = createUsersSearchHandler();
