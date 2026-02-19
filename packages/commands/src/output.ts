import { exitCodeForError } from "./errors";
import type { CliIo, CliResult } from "./types";

export const DEFAULT_IO: CliIo = {
  stdout: (line) => {
    console.log(line);
  },
  stderr: (line) => {
    console.error(line);
  },
};

const writeLines = (lines: string[], writer: (line: string) => void): void => {
  for (const line of lines) {
    writer(line);
  }
};

export const renderCliResult = (result: CliResult, json: boolean, io: CliIo): number => {
  if (json) {
    io.stdout(JSON.stringify(result, null, 2));
    if (!result.ok) {
      return exitCodeForError(result.error.code);
    }

    return result.exitCodeOverride ?? 0;
  }

  if (result.ok) {
    if (result.textLines && result.textLines.length > 0) {
      writeLines(result.textLines, io.stdout);
    } else if (result.message) {
      io.stdout(result.message);
    }

    return result.exitCodeOverride ?? 0;
  }

  io.stderr(result.error.message);
  if (result.error.hint) {
    io.stderr(result.error.hint);
  }

  return exitCodeForError(result.error.code);
};
