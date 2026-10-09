import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  forgetGrantApplications,
  grantApplicationTool,
  lookupGrantApplication,
  SECTION_LIMITS,
  ZCG_APPLICATION_URL,
} from "./grant-application";
import {
  isFinancialEvidence,
  numericFacts,
  unsupportedFigures,
} from "./grounding";
import {
  applicationSections,
  statusFromLabels,
  totalBudgetFromBody,
} from "@/lib/zcg/github-applications-parse";

const body = [
  "### Terms and Conditions", "", "- [x] I agree to the Grant Agreement terms if funded", "",
  "### Applicant Name",
  "",
  "Zcash India",
  "",
  "### Requested Grant Amount (USD)",
  "",
  "$20,300",
  "",
  "### Project Summary",
  "",
  "A one-day **Zcash World** event in Mumbai during Devcon 8 week. <!-- form hint --> ![banner](https://x/y.png) See [the forum](https://forum.zcashcommunity.com/t/1).",
  "",
  "### Milestones",
  "",
  "_No response_",
  "",
  "### Budget breakdown",
  "",
  `Venue $8,000\n${"Catering and travel ".repeat(80)}`,
  "",
  "### Total Budget (USD)",
  "",
  "$20,300",
  "",
].join("\n");
const issue = (over: Record<string, unknown> = {}) => ({
  number: 405,
  title: "Grant Application — Zcash World, Mumbai (Devcon 8 week)",
  html_url: ZCG_APPLICATION_URL(405),
  state: "open",
  created_at: "2026-08-30T12:54:59Z",
  closed_at: null,
  comments: 4,
  body,
  user: { login: "jatinsahijwani" },
  labels: [
    { name: "📋 Grant Application" },
    { name: "👀 Ready For ZCG Review" },
    { name: "✅ Grant Approved" },
    { name: "✅ Startup Payment Completed" },
  ],
  ...over,
});
const respond = (status: number, json?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
});
const fetchMock = vi.fn();
const signal = () => new AbortController().signal;

beforeEach(() => {
  forgetGrantApplications();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("read_grant_application", () => {
  it("declares a strict single-argument tool", () => {
    expect(grantApplicationTool).toMatchObject({
      type: "function",
      name: "read_grant_application",
      strict: true,
      parameters: { required: ["issue"], additionalProperties: false },
    });
    expect(grantApplicationTool.description).toContain(
      "ZcashCommunityGrants/zcashcommunitygrants",
    );
  });
  it("reads the application form: amounts, labels, dates and section excerpts the guard can verify", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, issue()));
    const result = await lookupGrantApplication({ issue: 405 }, signal());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/405",
    );
    expect(init).toMatchObject({
      cache: "no-store",
      headers: expect.objectContaining({
        accept: "application/vnd.github+json",
      }),
    });
    const { data, sourceUrl } = JSON.parse(result.content);
    expect(sourceUrl).toBe(ZCG_APPLICATION_URL(405));
    expect(data).toMatchObject({
      kind: "grant_application",
      number: 405,
      applicant: "jatinsahijwani",
      state: "open",
      labelStatus: "paid",
      createdAt: "2026-08-30T12:54:59Z",
      closedAt: null,
      comments: 4,
      requestedUsd: 20300,
      totalBudgetUsd: 20300,
      excerpt: {
        charactersPerSection: SECTION_LIMITS.perSection,
        truncatedSections: 1,
        completeApplicationUrl: ZCG_APPLICATION_URL(405),
      },
    });
    expect(data.labels).toEqual([
      "📋 Grant Application",
      "👀 Ready For ZCG Review",
      "✅ Grant Approved",
      "✅ Startup Payment Completed",
    ]);
    expect(
      data.sections.map((section: { heading: string }) => section.heading),
    ).toEqual([
      "Applicant Name",
      "Requested Grant Amount (USD)",
      "Project Summary",
      "Budget breakdown",
      "Total Budget (USD)",
    ]);
    expect(data.sections[2]).toEqual({
      heading: "Project Summary",
      text: "A one-day Zcash World event in Mumbai during Devcon 8 week. See the forum.",
      truncated: false,
    });
    expect(data.sections[3]).toMatchObject({ truncated: true });
    expect(data.sections[3].text).toHaveLength(SECTION_LIMITS.perSection);
    expect(data.note).toContain("neither an approved nor a paid amount");
    expect(result.source).toEqual({
      title:
        "Grant Application — Zcash World, Mumbai (Devcon 8 week) · ZCG application #405",
      url: ZCG_APPLICATION_URL(405),
      retrievedAt: expect.any(String),
    });
    // The parsed amounts are typed facts; a figure quoted from a section excerpt is not.
    expect(numericFacts([result])).toContainEqual({
      unit: "USD",
      value: 20300,
    });
    expect(
      unsupportedFigures(
        "The team asked for US$ 20,300 and listed a $8,000 venue.",
        numericFacts([result]),
      ),
    ).toEqual(["$8,000"]);
    expect(isFinancialEvidence([result])).toBe(false);
  });
  it("caches a reading for a while and never calls GitHub for an invalid number", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, issue()));
    await lookupGrantApplication({ issue: 405 }, signal());
    await lookupGrantApplication({ issue: 405 }, signal());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const raw of [
      { issue: 0 },
      { issue: 1.5 },
      { issue: "405" },
      { issue: 405, extra: 1 },
      null,
    ]) {
      expect(
        JSON.parse((await lookupGrantApplication(raw, signal())).content).error,
      ).toContain("issue number");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reports a deleted or unknown issue as missing, not as a verdict, and a pull request as no application", async () => {
    fetchMock.mockResolvedValueOnce(respond(404, { message: "Not Found" }));
    const missing = JSON.parse(
      (await lookupGrantApplication({ issue: 99999 }, signal())).content,
    );
    expect(missing.data).toMatchObject({
      kind: "grant_application",
      number: 99999,
      missing: true,
      url: ZCG_APPLICATION_URL(99999),
    });
    expect(missing.data.note).toContain("not a verdict");
    fetchMock.mockResolvedValueOnce(
      respond(200, issue({ number: 7, pull_request: { url: "x" } })),
    );
    expect(
      JSON.parse((await lookupGrantApplication({ issue: 7 }, signal())).content)
        .data.missing,
    ).toBe(true);
  });
  it("turns a GitHub failure or an abort into an unavailable note that invents nothing", async () => {
    fetchMock.mockResolvedValueOnce(respond(503));
    const failed = await lookupGrantApplication({ issue: 398 }, signal());
    expect(JSON.parse(failed.content).error).toContain("unavailable");
    expect(failed.source).toEqual({
      title: "ZCG application #398",
      url: ZCG_APPLICATION_URL(398),
    });
    expect(numericFacts([failed])).not.toContainEqual(
      expect.objectContaining({ unit: "USD" }),
    );
    fetchMock.mockResolvedValueOnce(
      respond(
        200,
        issue({
          number: 398,
          body: "### Requested Grant Amount (USD)\n\n43,524\n",
        }),
      ),
    );
    expect(
      JSON.parse(
        (await lookupGrantApplication({ issue: 398 }, signal())).content,
      ).data,
    ).toMatchObject({ requestedUsd: 43524, totalBudgetUsd: null });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      lookupGrantApplication({ issue: 405 }, aborted.signal),
    ).rejects.toThrow();
  });
});

describe("application form parsing", () => {
  it("reads the total budget on its own and the verdict from labels", () => {
    expect(totalBudgetFromBody(body)).toBe(20300);
    expect(
      totalBudgetFromBody("### Total Budget (USD)\n\nabout twenty thousand\n"),
    ).toBeNull();
    expect(statusFromLabels(["📋 Grant Application"])).toBe("review");
    expect(statusFromLabels(["❌ Declined"])).toBe("other");
    expect(statusFromLabels(["✅ Grant Approved"])).toBe("approved");
  });
  it("cuts sections at both limits, keeps preamble text and drops empty form answers", () => {
    const sections = applicationSections(
      `Intro line\n\n## Team\n\n${"a".repeat(50)}\n\n### Risks\n\n${"b".repeat(50)}\n\n### Empty\n\nN/A\n`,
      { perSection: 30, total: 40 },
    );
    expect(sections).toEqual([
      { heading: "", text: "Intro line", truncated: false },
      { heading: "Team", text: "a".repeat(30), truncated: true },
    ]);
    expect(applicationSections(undefined, SECTION_LIMITS)).toEqual([]);
  });
});
