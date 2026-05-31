import {
  type CreateClientOptions,
  isCliErrorResult,
  mapSlackClientError,
  readBooleanOption,
  readJsonObjectOption,
  readRequiredPayloadString,
  resolveTokenForContext,
  validatePayloadKeys,
} from "./messages-shared";
import { createError } from "../errors";
import { createSlackWebApiClient } from "../slack/client";
import { resolveSlackToken } from "../slack/token";
import type { ResolvedSlackToken, SlackViewsWebApiClient } from "../slack/types";
import type { CliOptions, CliResult, CommandRequest } from "../types";

const COMMAND_ID = "views.publish";
const USAGE_HINT =
  "Usage: slack views publish <user-id(required,non-empty)> --view=<json|-> [--hash=<hash>] [--payload=<json|->] [--dry-run[=<bool>]] [--json]";

const PAYLOAD_KEYS = ["user_id", "view", "hash"];

type ViewsPublishHandlerDeps = {
  createClient: (options?: CreateClientOptions) => SlackViewsWebApiClient;
  resolveToken: (
    env?: Record<string, string | undefined>,
  ) => ResolvedSlackToken | Promise<ResolvedSlackToken>;
  env: Record<string, string | undefined>;
};

type PublishViewRequest = {
  userId: string;
  view: Record<string, unknown>;
  hash?: string;
};

const defaultDeps: ViewsPublishHandlerDeps = {
  createClient: createSlackWebApiClient,
  resolveToken: resolveSlackToken,
  env: process.env,
};

const readOptionalStringOption = (
  options: CliOptions,
  optionName: string,
): string | undefined | CliResult => {
  const value = options[optionName];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      `views publish --${optionName} requires a non-empty value. [MISSING_ARGUMENT]`,
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return value.trim();
};

const validateHomeView = (view: Record<string, unknown>): CliResult | undefined => {
  if (view.type !== "home") {
    return createError(
      "INVALID_ARGUMENT",
      "views publish --view field 'type' must be 'home'.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  if (!Array.isArray(view.blocks)) {
    return createError(
      "INVALID_ARGUMENT",
      "views publish --view field 'blocks' must be an array.",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  return undefined;
};

const resolveRequest = async (request: CommandRequest): Promise<PublishViewRequest | CliResult> => {
  const payloadOrError = await readJsonObjectOption(
    request.options,
    "payload",
    "views publish",
    USAGE_HINT,
    COMMAND_ID,
    request.context.readStdin,
  );
  if (isCliErrorResult(payloadOrError)) {
    return payloadOrError;
  }

  if (payloadOrError !== undefined) {
    if (request.positionals.length > 0 || request.options.view !== undefined) {
      return createError(
        "INVALID_ARGUMENT",
        "views publish cannot mix positional arguments or --view with --payload.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const payloadKeyError = validatePayloadKeys(
      payloadOrError,
      PAYLOAD_KEYS,
      "views publish",
      USAGE_HINT,
      COMMAND_ID,
    );
    if (payloadKeyError !== undefined) {
      return payloadKeyError;
    }

    const userIdOrError = readRequiredPayloadString(
      payloadOrError,
      "user_id",
      "views publish",
      USAGE_HINT,
      COMMAND_ID,
    );
    if (isCliErrorResult(userIdOrError)) {
      return userIdOrError;
    }

    const view = payloadOrError.view;
    if (typeof view !== "object" || view === null || Array.isArray(view)) {
      return createError(
        "INVALID_ARGUMENT",
        "views publish --payload requires object field 'view'.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    const viewError = validateHomeView(view as Record<string, unknown>);
    if (viewError !== undefined) {
      return viewError;
    }

    const hash = payloadOrError.hash;
    if (hash !== undefined && (typeof hash !== "string" || hash.trim().length === 0)) {
      return createError(
        "INVALID_ARGUMENT",
        "views publish --payload field 'hash' must be a non-empty string when provided.",
        USAGE_HINT,
        COMMAND_ID,
      );
    }

    return {
      userId: userIdOrError,
      view: view as Record<string, unknown>,
      hash: typeof hash === "string" ? hash.trim() : undefined,
    };
  }

  const rawUserId = request.positionals[0];
  if (rawUserId === undefined || rawUserId.trim().length === 0) {
    return createError(
      "INVALID_ARGUMENT",
      "views publish requires <user-id>. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const viewOrError = await readJsonObjectOption(
    request.options,
    "view",
    "views publish",
    USAGE_HINT,
    COMMAND_ID,
    request.context.readStdin,
  );
  if (isCliErrorResult(viewOrError)) {
    return viewOrError;
  }
  if (viewOrError === undefined) {
    return createError(
      "INVALID_ARGUMENT",
      "views publish requires --view=<json|->. [MISSING_ARGUMENT]",
      USAGE_HINT,
      COMMAND_ID,
    );
  }

  const viewError = validateHomeView(viewOrError);
  if (viewError !== undefined) {
    return viewError;
  }

  const hashOrError = readOptionalStringOption(request.options, "hash");
  if (isCliErrorResult(hashOrError)) {
    return hashOrError;
  }

  return {
    userId: rawUserId.trim(),
    view: viewOrError,
    hash: hashOrError,
  };
};

export const createViewsPublishHandler = (depsOverrides: Partial<ViewsPublishHandlerDeps> = {}) => {
  const deps: ViewsPublishHandlerDeps = {
    ...defaultDeps,
    ...depsOverrides,
  };

  return async (request: CommandRequest): Promise<CliResult> => {
    const dryRunOrError = readBooleanOption(
      request.options,
      "dry-run",
      "views publish",
      USAGE_HINT,
      COMMAND_ID,
      false,
    );
    if (isCliErrorResult(dryRunOrError)) {
      return dryRunOrError;
    }

    const resolvedRequest = await resolveRequest(request);
    if (isCliErrorResult(resolvedRequest)) {
      return resolvedRequest;
    }

    if (dryRunOrError) {
      return {
        ok: true,
        command: COMMAND_ID,
        message: `Dry run: Home view publish validated for ${resolvedRequest.userId}.`,
        data: {
          dryRun: true,
          request: {
            user_id: resolvedRequest.userId,
            view: resolvedRequest.view,
            hash: resolvedRequest.hash,
          },
        },
        textLines: [`Dry run: validated Home view publish for ${resolvedRequest.userId}.`],
      };
    }

    try {
      const resolvedToken = await resolveTokenForContext(
        request.context,
        deps.env,
        deps.resolveToken,
      );
      const client = deps.createClient({ token: resolvedToken.token, env: deps.env });
      const data = await client.publishView(resolvedRequest);

      return {
        ok: true,
        command: COMMAND_ID,
        message: `Home view published for ${resolvedRequest.userId}.`,
        data: {
          user_id: resolvedRequest.userId,
          view: data.view,
        },
        textLines: [`Published Home view for ${resolvedRequest.userId}.`],
      };
    } catch (error) {
      return mapSlackClientError(error, COMMAND_ID);
    }
  };
};

export const viewsPublishHandler = createViewsPublishHandler();
