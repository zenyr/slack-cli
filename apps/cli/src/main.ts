#!/usr/bin/env bun

import { runCli } from "@zenyr/slack-cli-commands";

const packageJson = await Bun.file(new URL("../package.json", import.meta.url)).json();
const version = String(packageJson.version ?? "0.0.0-dev");

const args = Bun.argv.slice(2);
const exitCode = await runCli(args, { version });

process.exit(exitCode);
