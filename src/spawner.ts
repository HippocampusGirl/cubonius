import { createInterface } from "node:readline/promises";
import { ConnectConfig } from "ssh2";

import { debug } from "./debug.js";
import { Forwarder } from "./forwarder.js";
import { SSHService } from "./ssh.js";
import { Tunnel } from "./tunnel.js";

export class Spawner extends SSHService {
  tunnels: Tunnel[];
  forwarders: Map<string, Forwarder> = new Map();
  _connectionConfiguration: ConnectConfig;

  constructor(tunnels: Tunnel[], connectionConfiguration: ConnectConfig) {
    super();
    this._connectionConfiguration = connectionConfiguration;
    this.tunnels = tunnels;
  }

  override async getConnectionConfiguration(): Promise<ConnectConfig> {
    return this._connectionConfiguration;
  }
  override async reconnect(): Promise<void> {
    for (const forwarder of this.forwarders.values()) {
      await forwarder.close();
    }
    this.forwarders.clear();
    await super.reconnect();
  }
  override async connect(): Promise<void> {
    await this.getClient();
  }
  override async close(): Promise<void> {
    this.running = false;
    for (const forwarder of this.forwarders.values()) {
      await forwarder.close();
    }
    this.forwarders.clear();
    debug(`closing spawner`);
    await super.close();
  }

  async loop(): Promise<void> {
    while (this.running) {
      const channel = await this.exec('squeue --me --format="%N" --noheader');
      const readline = createInterface({ input: channel });
      for await (let node of readline) {
        node = node.trim();
        if (node === "") {
          continue;
        }
        if (this.forwarders.has(node)) {
          continue;
        }
        await this.forward(node);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 15 * 1000);
      });
    }
  }

  private async forward(node: string): Promise<void> {
    if (!this.running) {
      return;
    }
    debug(`forwarding to ${node}`);

    const forwarder = new Forwarder(node, this);
    await forwarder.connect();
    this.forwarders.set(node, forwarder);
  }
}
