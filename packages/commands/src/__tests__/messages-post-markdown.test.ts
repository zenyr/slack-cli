import { describe, expect, test } from "bun:test";

import { convertMarkdownToSlackMrkdwn } from "../messages-post/markdown";

describe("convertMarkdownToSlackMrkdwn", () => {
  test("converts markdown bold to slack mrkdwn bold", () => {
    expect(convertMarkdownToSlackMrkdwn("deploy **done** today")).toBe("deploy *done* today");
  });

  test("converts multiple bold segments", () => {
    expect(convertMarkdownToSlackMrkdwn("**alpha** and **beta**")).toBe("*alpha* and *beta*");
  });

  test("converts markdown links to slack link format", () => {
    expect(convertMarkdownToSlackMrkdwn("Read [docs](https://example.com) now")).toBe(
      "Read <https://example.com|docs> now",
    );
  });

  test("converts both bold and links in normal text", () => {
    expect(
      convertMarkdownToSlackMrkdwn("Use **guide** in [docs](https://example.com/guide) please"),
    ).toBe("Use *guide* in <https://example.com/guide|docs> please");
  });

  test("preserves inline code span exactly", () => {
    expect(
      convertMarkdownToSlackMrkdwn(
        "run `**do-not-bold** [x](https://example.com)` and **do-bold**",
      ),
    ).toBe("run `**do-not-bold** [x](https://example.com)` and *do-bold*");
  });

  test("preserves fenced code block exactly", () => {
    const input =
      'before **yes**\n```ts\nconst s = "**no** [x](https://example.com)";\n```\nafter [ok](https://ok.dev)';
    const output = convertMarkdownToSlackMrkdwn(input);

    expect(output).toBe(
      'before *yes*\n```ts\nconst s = "**no** [x](https://example.com)";\n```\nafter <https://ok.dev|ok>',
    );
  });

  test("keeps unmatched bold markers unchanged", () => {
    expect(convertMarkdownToSlackMrkdwn("start **bold only")).toBe("start **bold only");
  });

  test("keeps malformed link unchanged", () => {
    expect(convertMarkdownToSlackMrkdwn("open [docs](https://example.com")).toBe(
      "open [docs](https://example.com",
    );
  });

  test("does not throw on unclosed fenced code block", () => {
    expect(() =>
      convertMarkdownToSlackMrkdwn("**ok**\n```\n[x](https://example.com)\n**no**"),
    ).not.toThrow();
    expect(convertMarkdownToSlackMrkdwn("**ok**\n```\n[x](https://example.com)\n**no**")).toBe(
      "*ok*\n```\n[x](https://example.com)\n**no**",
    );
  });

  test("is deterministic for identical input", () => {
    const input = "**A** [B](https://b.dev) `**C** [D](https://d.dev)`";
    const first = convertMarkdownToSlackMrkdwn(input);
    const second = convertMarkdownToSlackMrkdwn(input);

    expect(first).toBe(second);
  });
});
