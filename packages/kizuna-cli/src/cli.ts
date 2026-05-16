#!/usr/bin/env node
import { Command } from "commander";
import { registerSetup } from "./commands/setup.js";
import { registerSearch } from "./commands/search.js";
import { registerList } from "./commands/list.js";
import { registerStats } from "./commands/stats.js";
import { registerPrune } from "./commands/prune.js";
import { registerHook } from "./commands/hook.js";
import { registerCleanup } from "./commands/cleanup.js";
import { registerRecap } from "./commands/recap.js";
import { registerPlugin } from "./commands/plugin.js";
import { registerExport } from "./commands/export.js";

const program = new Command();

program.name("kizuna").description("Local long-term memory for Claude Code").version("0.0.0");

registerSetup(program);
registerSearch(program);
registerList(program);
registerStats(program);
registerPrune(program);
registerHook(program);
registerCleanup(program);
registerRecap(program);
registerPlugin(program);
registerExport(program);

program.parse();
