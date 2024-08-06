import { Command } from "commander";
import Debug from "debug";
import esMain from "es-main";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parse } from "ssh-config";
import * as ssh2 from "ssh2";

import { debug } from "./debug.js";
import { signal } from "./signal.js";
import { Spawner } from "./spawner.js";
import { Tunnel } from "./tunnel.js";

export const command = new Command();
command
  .name("cubonius")
  .showHelpAfterError()
  .requiredOption("--login-node <string>", "ssh host of the login node")
  .requiredOption(
    "--tunnel <string...>",
    'specify one or more "remote port number -> local port number" tunnels'
  )
  .option("--debug", "print extra debug information")
  .hook("preAction", (that) => {
    const options = that.opts();
    if (process.env["DEBUG"]) {
      return;
    }
    if (options["debug"]) {
      Debug.enable("*");
    }
  })
  .action(run);

export const isMainModule = esMain(import.meta);
if (isMainModule) {
  command.parse(process.argv);
}

async function run(): Promise<void> {
  const options = command.opts();
  debug(`running with options: %O`, options);

  const home = homedir();
  const sshConfigText = await readFile(`${home}/.ssh/config`, {
    encoding: "utf-8",
  });
  const sshConfig = parse(sshConfigText).compute(options["loginNode"]);

  let host = sshConfig["HostName"];
  if (typeof host !== "string") {
    throw new Error("the hostname received from ssh-config has to be a string");
  }
  host = host.replace("%h", options["loginNode"]);
  const username = sshConfig["User"];
  if (typeof username !== "string") {
    throw new Error("the username received from ssh-config has to be a string");
  }

  const tunnels: Tunnel[] = options["tunnel"].map((t: string) => {
    const [remotePort, localPort] = t
      .split("->")
      .map((p) => parseInt(p.trim()));
    return { remotePort, localPort };
  });

  const agent = process.env["SSH_AUTH_SOCK"];
  if (agent === undefined) {
    throw new Error("ssh-agent is not running");
  }
  const connectConfig: ssh2.ConnectConfig = {
    host,
    username,
    agent,
    agentForward: true,
    keepaliveInterval: 30 * 1000,
  };
  debug(`ssh connect config: %O`, connectConfig);

  const spawner = new Spawner(tunnels, connectConfig);
  signal.finally(() => {
    spawner.close();
  });
  await spawner.loop();
}
