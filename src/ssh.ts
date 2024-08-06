import { promisify } from "node:util";
import { Client, ClientChannel, ConnectConfig } from "ssh2";

import { debug } from "./debug.js";

export abstract class SSHService {
  retries: number = 0;
  running: boolean = true;

  private client: Client | null = null;

  abstract getConnectionConfiguration(): Promise<ConnectConfig>;
  async getClient(): Promise<Client> {
    if (this.client !== null) {
      const client = this.client;
      return new Promise((resolve) => resolve(client));
    }

    const client = new Client();
    client.on("banner", (message) => debug(`received banner: ${message}`));
    client.once("close", () => {
      client.destroy();
      if (this.client === client) {
        this.client = null;
      }
      this.reconnect();
    });

    const connectionConfiguration = await this.getConnectionConfiguration();

    return new Promise((resolve, reject) => {
      client.once("error", reject);
      client.once("timeout", reject);
      client.once("ready", () => {
        client.removeAllListeners("error");
        client.removeAllListeners("timeout");

        this.retries = 0;

        this.client = client;

        debug(`connected`);
        resolve(client);
      });
      client.connect(connectionConfiguration);
    });
  }

  async exec(c: string): Promise<ClientChannel> {
    const client = await this.getClient();
    return promisify(client.exec).bind(client)(c);
  }
  async jump(n: string): Promise<ClientChannel> {
    const client = await this.getClient();
    return promisify(client.forwardOut).bind(client)("", 0, n, 22);
  }
  async proxy(port: number): Promise<number> {
    const client = await this.getClient();
    return promisify(client.forwardIn).bind(client)("localhost", port);
  }

  async reconnect(): Promise<void> {
    if (!this.running) {
      return;
    }

    const delay = 1000 * 2 ** this.retries;
    debug(`reconnecting in ${delay} ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (error) {
      debug("reconnect failed: %O", error);
      this.retries++;
      this.reconnect();
    }
  }
  async close(): Promise<void> {
    this.running = false;
    if (this.client) {
      this.client.end();
    }
  }

  abstract connect(): Promise<unknown>;
}
