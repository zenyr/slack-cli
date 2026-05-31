import {
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBooleanOption,
  resolveTokenForContext,
} from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackViewsWebApiClient } from "../slack/types";
import type { CliResult, CommandRequest } from "../types";

const COMMAND_ID = "views.clear";
const USAGE_HINT =
  "Usage: slack views clear <user-id(required,non-empty)> [--dry-run[=<bool>]] [--json]";

const EMPTY_HOME_VIEW = {
  type: "home",
  blocks: [],
};

type ViewsClearHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackViewsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

const defaultDeps: ViewsClearHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

export const createViewsClearHandler = (depsOverrides: Partial<ViewsClearHandlerDeps> = {}) => {
  const deps: ViewsClearHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const dryRunOrError = readBooleanOption(
      request.options,
      "dry-run",
      "views clear",
      USAGE_HINT,
      COMMAND_ID,
      false,
    );
    if (isCliErrorResult(dryRunOrError)) {
      return dryRunOrError;
    }

    const userId = request.positionals[0]?.trim();
    if (userId === undefined || userId.length === 0) {
      return createError(
        "INVALID_ARGUMENT",
        "views clear requires <user-id>. [MISSING_ARGUMENT]",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    if (dryRunOrError) {
      return {
        ok: true,
        command: COMMAND_ID,
        message: `Dry run: Home view clear validated for ${userId}.`,
        data: {
          dryRun: true,
          request: {
            user_id: userId,
            view: EMPTY_HOME_VIEW,
          },
        },
        textLines: [`Dry run: validated Home view clear for ${userId}.`],
      };
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.publishView({ userId, view: EMPTY_HOME_VIEW });

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Home view cleared for ${userId}.`,
        data: {
          user_id: userId,
          view: data.view,
        },
        textLines: [`Cleared Home view for ${userId}.`],
      };
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const viewsClearHandler = createViewsClearHandler();
