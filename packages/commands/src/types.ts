export type CliOptionValue = string | boolean;

export type CliOptions = Record<string, CliOptionValue>;

export type GlobalFlags = {
  json: boolean;
  help: boolean;
  version: boolean;
};

export type ParsedArgv = {
  flags: GlobalFlags;
  tokens: string[];
  positionalsFromDoubleDash: string[];
  options: CliOptions;
};

export type CliContext = {
  version: string;
};

export type CliErrorCode =
  | "UNKNOWN_COMMAND"
  | "INVALID_ARGUMENT"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export type CliError = {
  code: CliErrorCode;
  message: string;
  hint?: string;
};

export type CliSuccess = {
  ok: true;
  command: string;
  message?: string;
  data?: unknown;
  textLines?: string[];
};

export type CliFailure = {
  ok: false;
  command?: string;
  error: CliError;
};

export type CliResult = CliSuccess | CliFailure;

export type CommandRequest = {
  commandPath: string[];
  positionals: string[];
  options: CliOptions;
  flags: GlobalFlags;
  context: CliContext;
};

export type MaybePromise<T> = T | Promise<T>;

export type CommandHandler = (request: CommandRequest) => MaybePromise<CliResult>;

export type CommandDefinition = {
  path: string[];
  handler: CommandHandler;
};

export type CliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};
