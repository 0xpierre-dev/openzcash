import { isAbsolute } from "node:path";

/** Explicit operator configuration; never select a maintainer's host or local socket. */
export function readArchiveSshConfig(env: Record<string, string | undefined>, socketArgument?: string) {
  const host = env.ARCHIVE_SSH_TARGET ?? "";
  const socket = socketArgument ?? env.ARCHIVE_SSH_CONTROL_PATH ?? "";
  const bridgePath = env.ARCHIVE_RPC_BRIDGE_PATH ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)
      || ![socket, bridgePath].every(value => isAbsolute(value) && !/[\0\r\n]/.test(value))) {
    throw new Error("ARCHIVE_SSH_NOT_CONFIGURED");
  }
  return { host, socket, bridgePath };
}
