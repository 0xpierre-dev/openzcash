import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import type { ArchiveChainConfig } from "../lib/archive/chain";

const configuration = z.object({
  enabled: z.literal(true), activityEnabled: z.boolean().optional(), startedAt: z.string().datetime(), sshHost: z.string(), sshKeyPath: z.string(),
  publicReaderPath: z.string().startsWith("/"), legacyPublicReaderPath: z.string().startsWith("/").optional()
}).strict();

/** Load private operator configuration without reading or displaying its key. */
export async function loadParticipateAutomationConfig() {
  const path = process.env.PARTICIPATE_AUTOMATION_CONFIG;
  if (!path?.startsWith("/")) throw new Error("AUTOMATION_CONFIGURATION_REQUIRED");
  if ((await stat(path)).mode & 0o077) throw new Error("PRIVATE_CONFIGURATION_PERMISSIONS_REQUIRED");
  const config = configuration.parse(JSON.parse(await readFile(path, "utf8")));
  const readChain = async (readerPath: string): Promise<ArchiveChainConfig> => ({ ...JSON.parse(await readFile(readerPath, "utf8")),
    reader: { url: "http://127.0.0.1:28248" }, chain: { url: "http://127.0.0.1:8232" } });
  return { operator: config, automation: { activityEnabled: config.activityEnabled === true, startedAt: new Date(config.startedAt), githubToken: process.env.PARTICIPATE_GITHUB_READ_TOKEN,
    chain: await readChain(config.publicReaderPath), ...(config.legacyPublicReaderPath ? { legacyChain: await readChain(config.legacyPublicReaderPath) } : {}) } };
}
