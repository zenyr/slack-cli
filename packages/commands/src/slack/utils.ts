import type { SlackClientError, SlackClientErrorCode } from "./types";

type CreateSlackClientErrorArgs = {
  code: SlackClientErrorCode;
  message: string;
  hint?: string;
  status?: number;
  retryAfterSeconds?: number;
  details?: string;
};

export const createSlackClientError = (args: CreateSlackClientErrorArgs): SlackClientError => {
  const error = new Error(args.message);

  return Object.assign(error, {
    name: "SlackClientError",
    code: args.code,
    hint: args.hint,
    status: args.status,
    retryAfterSeconds: args.retryAfterSeconds,
    details: args.details,
  });
};

export const isSlackClientError = (error: unknown): error is SlackClientError => {
  if (!isRecord(error)) {
    return false;
  }

  const code = readString(error, "code");
  return code?.startsWith("SLACK_");
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

export const readBoolean = (record: Record<string, unknown>, key: string): boolean | undefined => {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
};

export const readNumber = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
};

export const readRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

export const readArray = (record: Record<string, unknown>, key: string): unknown[] | undefined => {
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
};
