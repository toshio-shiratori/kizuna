import type { Command } from "commander";
import { registerList } from "./plugin/list.js";
import { registerInfo } from "./plugin/info.js";
import { registerEnable } from "./plugin/enable.js";
import { registerDisable } from "./plugin/disable.js";

export function registerPlugin(program: Command): void {
  const pluginCmd = program.command("plugin").description("Manage plugins");

  registerList(pluginCmd);
  registerInfo(pluginCmd);
  registerEnable(pluginCmd);
  registerDisable(pluginCmd);
}
