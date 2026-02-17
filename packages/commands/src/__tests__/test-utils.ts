import { runCli } from "../index";

type IoBuffer = {
  io: {
    stdout: (line: string) => void;
    stderr: (line: string) => void;
  };
  stdout: string[];
  stderr: string[];
};

export const createIoBuffer = (): IoBuffer => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stdout: (line: string) => {
        stdout.push(line);
      },
      stderr: (line: string) => {
        stderr.push(line);
      },
    },
    stdout,
    stderr,
  };
};

export const parseJsonOutput = (stdout: string[]): unknown => {
  return JSON.parse(stdout.join("\n"));
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const runCliWithBuffer = async (argv: string[]) => {
  const buffer = createIoBuffer();
  const exitCode = await runCli(argv, { version: "1.2.3", io: buffer.io });

  return {
    exitCode,
    ...buffer,
  };
};
