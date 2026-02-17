import type { CliErrorCode, CliFailure } from "./types";

const EXIT_CODE_BY_ERROR: Record<CliErrorCode, number> = {
  UNKNOWN_COMMAND: 2,
  INVALID_ARGUMENT: 2,
  NOT_IMPLEMENTED: 2,
  INTERNAL_ERROR: 1,
};

export const createError = (
  code: CliErrorCode,
  message: string,
  hint?: string,
  command?: string,
): CliFailure => {
  return {
    ok: false,
    command,
    error: {
      code,
      message,
      hint,
    },
  };
};

export const exitCodeForError = (code: CliErrorCode): number => {
  return EXIT_CODE_BY_ERROR[code];
};
