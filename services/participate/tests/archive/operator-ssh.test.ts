import { readArchiveSshConfig } from "@/scripts/archive-ssh-config";

const config = {
  ARCHIVE_SSH_TARGET: "observer@node.example.test",
  ARCHIVE_SSH_CONTROL_PATH: "/tmp/audit/control",
  ARCHIVE_RPC_BRIDGE_PATH: "/opt/observer/read-only-bridge.py",
};

it("requires explicit operator settings without any default host", () => {
  expect(() => readArchiveSshConfig({})).toThrow("ARCHIVE_SSH_NOT_CONFIGURED");
  expect(readArchiveSshConfig(config)).toEqual({
    host: config.ARCHIVE_SSH_TARGET,
    socket: config.ARCHIVE_SSH_CONTROL_PATH,
    bridgePath: config.ARCHIVE_RPC_BRIDGE_PATH,
  });
  expect(readArchiveSshConfig(config, "/tmp/another/control").socket).toBe("/tmp/another/control");
});

it.each([
  { ARCHIVE_SSH_TARGET: "-oProxyCommand=unexpected" },
  { ARCHIVE_SSH_TARGET: "observer@node;unexpected" },
  { ARCHIVE_SSH_CONTROL_PATH: "relative/control" },
  { ARCHIVE_RPC_BRIDGE_PATH: "relative.py" },
  { ARCHIVE_RPC_BRIDGE_PATH: "/tmp/bridge\n.py" },
])("rejects malformed operator configuration %j", invalid => {
  expect(() => readArchiveSshConfig({ ...config, ...invalid })).toThrow("ARCHIVE_SSH_NOT_CONFIGURED");
});
