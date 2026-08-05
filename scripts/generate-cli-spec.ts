import { toCommandSchemas } from "../packages/commands/src/schema";
import { CLI_NAME, COMMANDS, RESOURCES, TOOLS } from "../packages/config/src/index";

const OUTPUT_PATH = new URL("../skill/cli-spec.json", import.meta.url);

const spec = {
  schemaVersion: 1,
  cli: {
    name: CLI_NAME,
  },
  commands: toCommandSchemas(COMMANDS),
  resources: RESOURCES,
  tools: TOOLS,
};

const formatResult = Bun.spawnSync({
  cmd: ["bunx", "biome", "format", "--stdin-file-path=skill/cli-spec.json"],
  stdin: new Blob([`${JSON.stringify(spec, null, 2)}\n`]),
  stdout: "pipe",
  stderr: "pipe",
});

if (!formatResult.success) {
  throw new Error(formatResult.stderr.toString());
}

const expected = formatResult.stdout.toString();
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const existing = await Bun.file(OUTPUT_PATH)
    .text()
    .catch(() => "");
  if (existing !== expected) {
    console.error("skill/cli-spec.json is stale. Run 'bun run generate'.");
    process.exit(1);
  }

  console.log("skill/cli-spec.json is up to date.");
} else {
  await Bun.write(OUTPUT_PATH, expected);
  console.log("Generated skill/cli-spec.json.");
}
