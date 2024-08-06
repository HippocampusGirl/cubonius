import { debug } from "./debug.js";

export const signal = new Promise<void>((resolve) => {
  const checkSIGINT = () => {
    debug("received interrupt signal");
    resolve();
  };
  process.once("SIGINT", checkSIGINT);
});
