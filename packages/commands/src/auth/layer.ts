import { type AuthTokenType, createAuthService, type LoginInput } from "@zenyr/slack-cli-auth";

export type AuthLayer = {
  check: () => Promise<unknown>;
  whoami: () => Promise<unknown>;
  login: (input: LoginInput) => Promise<unknown>;
  logout: () => Promise<void>;
  use: (type: AuthTokenType) => Promise<void>;
};

export const getAuthLayer = async (): Promise<AuthLayer> => {
  const service = createAuthService();

  return {
    check: async () => {
      return await service.check();
    },
    whoami: async () => {
      return await service.whoami();
    },
    login: async (input: LoginInput) => {
      return await service.login(input);
    },
    logout: async () => {
      await service.logout();
    },
    use: async (type: AuthTokenType) => {
      await service.useTokenType(type);
    },
  };
};
