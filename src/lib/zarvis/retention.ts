import type { ProviderLabel } from "./types";
/** What each provider keeps of a model answer and for how long, quoted from its own policy page on the date read; shown on /zarvis/about and in the chat's privacy note. No "server-only": the chat component reads it too. `training` names a second page when the summary's training clause is not on the retention page; both are linked. */
export type ProviderRetention = { provider: string; days: number; api: "Responses API" | "Messages API"; url: string; readOn: string; linkLabel: string; summary: string; training?: { url: string; linkLabel: string } };
export const PROVIDER_RETENTION: Record<ProviderLabel, ProviderRetention> = {
  "xAI (Grok)": {
    provider: "xAI", days: 30, api: "Responses API", url: "https://docs.x.ai/developers/faq/security", readOn: "2026-09-28", linkLabel: "the provider's security FAQ",
    summary: "stores API requests and responses encrypted at rest for 30 days for abuse auditing, does not train on them and deletes them automatically afterwards. OpenZcash sends each request with response storage disabled, which is not the same as that provider's zero-data-retention setting.",
  },
  OpenAI: {
    provider: "OpenAI", days: 30, api: "Responses API", url: "https://developers.openai.com/api/docs/guides/your-data", readOn: "2026-10-07", linkLabel: "the provider's data-usage page",
    summary: "keeps API inputs and outputs for up to 30 days for abuse monitoring and does not train on them by default. OpenZcash sends each request with response storage disabled, which is not the same as that provider's zero-data-retention setting.",
  },
  "Anthropic (Claude)": {
    provider: "Anthropic", days: 30, api: "Messages API", url: "https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data", readOn: "2026-10-07", linkLabel: "the provider's data retention article",
    summary: "deletes API inputs and outputs from its backend within 30 days (material flagged for a usage-policy violation is kept longer) and does not train on them by default.",
    // The retention article says nothing about training; that clause rests on the training-policy article, read the same day.
    training: { url: "https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training", linkLabel: "its training-policy article" },
  },
};
/** The entry for a public provider label; null for anything else (an unknown or not yet loaded status). */
export const providerRetention = (label?: string | null): ProviderRetention | null => (label && Object.hasOwn(PROVIDER_RETENTION, label) ? PROVIDER_RETENTION[label as ProviderLabel] : null);
