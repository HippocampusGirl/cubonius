import { createConnection } from "node:net";
import { ConnectConfig } from "ssh2";

import { debug } from "./debug.js";
import { Spawner } from "./spawner.js";
import { SSHService } from "./ssh.js";

export class Forwarder extends SSHService {
  host: string;
  parent: Spawner;

  constructor(host: string, parent: Spawner) {
    super();
    this.host = host;
    this.parent = parent;
  }

  override async getConnectionConfiguration(): Promise<ConnectConfig> {
    const connectionConfiguration = {
      ...(await this.parent.getConnectionConfiguration()),
    };
    delete connectionConfiguration.host;
    connectionConfiguration.sock = await this.parent.jump(this.host);
    return connectionConfiguration;
  }
  override async connect(): Promise<void> {
    const client = await this.getClient();
    const tunnels = this.parent.tunnels;

    client.on("tcp connection", (connectionDetails, accept, reject): void => {
      const port = connectionDetails.destPort;
      debug(`new connection to ${port}`);

      const tunnel = tunnels.find((t) => t.remotePort === port);
      if (!tunnel) {
        debug(`no tunnel for port ${port}`);
        return reject();
      }

      const socket = createConnection(tunnel.localPort);
      socket.on("error", (error) => {
        debug(`socket error: ${error}`);
        return reject();
      });

      socket.on("connect", () => {
        debug(`connection forwarded to ${tunnel.localPort}`);
        const stream = accept();
        stream.pipe(socket);
        socket.pipe(stream);
        stream.on("close", () => {
          debug(`forwarded connection was closed`);
          socket.destroy();
        });
        socket.on("close", () => {
          debug(`forwarded connection was closed`);
          stream.close();
        });
      });
    });

    for (const tunnel of tunnels) {
      await this.proxy(tunnel.remotePort);
    }
  }
  override async close(): Promise<void> {
    debug(`closing forwarder`);
    await super.close();
  }
}
