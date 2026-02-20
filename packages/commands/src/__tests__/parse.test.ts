import { describe, expect, test } from "bun:test";

import { parseArgv } from "../parse";

describe("parseArgv", () => {
  test("treats args after -- as positionals only", () => {
    const parsed = parseArgv(["--json", "messages", "search", "--", "--help", "--limit=10", "-v"]);

    expect(parsed.flags).toEqual({
      help: false,
      json: true,
      version: false,
      xoxp: false,
      xoxb: false,
    });
    expect(parsed.tokens).toEqual(["messages", "search"]);
    expect(parsed.positionalsFromDoubleDash).toEqual(["--help", "--limit=10", "-v"]);
    expect(parsed.options).toEqual({});
  });

  test("supports --key=value and --key value", () => {
    const parsed = parseArgv([
      "messages",
      "search",
      "--query=deploy",
      "--limit",
      "25",
      "--verbose",
    ]);

    expect(parsed.tokens).toEqual(["messages", "search"]);
    expect(parsed.options).toEqual({
      limit: "25",
      query: "deploy",
      verbose: true,
    });
  });

  test("uses last value when option repeats", () => {
    const parsed = parseArgv([
      "messages",
      "search",
      "--query=first",
      "--query",
      "second",
      "--query=final",
    ]);

    expect(parsed.options).toEqual({
      query: "final",
    });
  });

  test("keeps global flags behavior unchanged", () => {
    const parsed = parseArgv([
      "--help",
      "--json",
      "messages",
      "search",
      "--version",
      "--",
      "--help",
      "--json",
      "--version",
    ]);

    expect(parsed.flags).toEqual({
      help: true,
      json: true,
      version: true,
      xoxp: false,
      xoxb: false,
    });
    expect(parsed.tokens).toEqual(["messages", "search"]);
    expect(parsed.positionalsFromDoubleDash).toEqual(["--help", "--json", "--version"]);
    expect(parsed.options).toEqual({});
  });

  test("treats malformed long option token as positional", () => {
    const parsed = parseArgv(["messages", "search", "--=value"]);

    expect(parsed.tokens).toEqual(["messages", "search", "--=value"]);
    expect(parsed.options).toEqual({});
  });
});
