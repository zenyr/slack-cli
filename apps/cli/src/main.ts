#!/usr/bin/env bun

import { runCli } from "@zenyr/slack-cli-commands";

import packageJson from "../package.json" with { type: "json" };

const version = typeof packageJson.version === "string" ? packageJson.version : "0.0.0-dev";

const args = Bun.argv.slice(2);
const exitCode = await runCli(args, { version });

process.exit(exitCode);
