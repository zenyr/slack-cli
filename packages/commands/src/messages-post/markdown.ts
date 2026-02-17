const convertBoldMarkdown = (input: string): string => {
  return input.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");
};

const convertMarkdownLinks = (input: string): string => {
  return input.replace(/\[([^\]\n]+?)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>");
};

const convertTextSegment = (segment: string): string => {
  const boldConverted = convertBoldMarkdown(segment);
  return convertMarkdownLinks(boldConverted);
};

type Segment = {
  value: string;
  preserve: boolean;
};

const findNextBacktickIndex = (input: string, startIndex: number): number => {
  return input.indexOf("`", startIndex);
};

const createSegments = (input: string): Segment[] => {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    if (input.startsWith("```", cursor)) {
      const closeIndex = input.indexOf("```", cursor + 3);
      const endIndex = closeIndex === -1 ? input.length : closeIndex + 3;
      segments.push({
        value: input.slice(cursor, endIndex),
        preserve: true,
      });
      cursor = endIndex;
      continue;
    }

    if (input[cursor] === "`") {
      const closeIndex = input.indexOf("`", cursor + 1);
      const endIndex = closeIndex === -1 ? input.length : closeIndex + 1;
      segments.push({
        value: input.slice(cursor, endIndex),
        preserve: true,
      });
      cursor = endIndex;
      continue;
    }

    const nextTickIndex = findNextBacktickIndex(input, cursor);
    const endIndex = nextTickIndex === -1 ? input.length : nextTickIndex;
    segments.push({
      value: input.slice(cursor, endIndex),
      preserve: false,
    });
    cursor = endIndex;
  }

  return segments;
};

export const convertMarkdownToSlackMrkdwn = (input: string): string => {
  const segments = createSegments(input);

  return segments
    .map((segment) => {
      return segment.preserve ? segment.value : convertTextSegment(segment.value);
    })
    .join("");
};
