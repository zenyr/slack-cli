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

type RunCliWithBufferOptions = {
  /** Simulate stdin input (e.g. heredoc content piped to --blocks). */
  stdin?: string;
};

export const runCliWithBuffer = async (argv: string[], opts: RunCliWithBufferOptions = {}) => {
  const buffer = createIoBuffer();
  const readStdin = opts.stdin !== undefined ? async () => opts.stdin : async () => undefined;
  const exitCode = await runCli(argv, { version: "1.2.3", io: buffer.io, readStdin });

  return {
    exitCode,
    ...buffer,
  };
};
