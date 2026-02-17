import type { AuthError, AuthErrorCode } from "./types";

type CreateAuthErrorInput = {
  code: AuthErrorCode;
  message: string;
  hint?: string;
  status?: number;
  details?: string;
};

export const createAuthError = (input: CreateAuthErrorInput): AuthError => {
  const error = new Error(input.message);

  return Object.assign(error, {
    name: "AuthError",
    code: input.code,
    hint: input.hint,
    status: input.status,
    details: input.details,
  });
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
