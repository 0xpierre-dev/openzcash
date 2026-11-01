import { render, screen, within } from "@testing-library/react";
import { ProposalMarkdown } from "@/components/proposal-markdown";

describe("ProposalMarkdown", () => {
  it("renders a proposal with nested sections, milestones, budgets and a checklist", () => {
    const { container } = render(<ProposalMarkdown>{[
      "# Community learning program",
      "",
      "Publish **three workshops** and a public report.",
      "",
      "## Milestones",
      "",
      "1. Recruit participants",
      "2. Publish materials",
      "",
      "| Milestone | Budget |",
      "| --- | ---: |",
      "| Workshops | 5 ZEC |",
      "| Report | 1 ZEC |",
      "",
      "- [x] Team identified",
      "- [ ] Schedule confirmed",
      "",
      "> Deliverables remain public.",
      "",
      "```json",
      '{ "network": "testnet" }',
      "```"
    ].join("\n")}</ProposalMarkdown>);

    expect(screen.getByRole("heading", { level: 2, name: "Community learning program" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Milestones" })).toBeInTheDocument();
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByText("three workshops").tagName).toBe("STRONG");
    const tableRegion = screen.getByRole("region", { name: "Proposal table" });
    expect(tableRegion).toHaveAttribute("tabindex", "0");
    expect(within(tableRegion).getByRole("cell", { name: "5 ZEC" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Completed item" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Completed item" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Incomplete item" })).not.toBeChecked();
    expect(screen.getByLabelText("Code block")).toHaveTextContent('{ "network": "testnet" }');
    expect(screen.getByLabelText("Code block")).toHaveAttribute("tabindex", "0");
  });

  it("does not execute raw HTML, inject controls, or load remote images", () => {
    const { container } = render(<ProposalMarkdown>{[
      '<script>alert("attack")</script>',
      "",
      '<img src="https://tracker.example/pixel" onerror="alert(1)">',
      "",
      '<iframe src="https://tracker.example/embed"></iframe>',
      "",
      '<input type="text" value="injected">',
      "",
      "![Architecture diagram](https://tracker.example/diagram.png)",
      "",
      "![Invisible tracker](data:image/svg+xml;base64,PHN2Zz4=)"
    ].join("\n")}</ProposalMarkdown>);

    expect(container.querySelector("script, img, iframe, input, svg")).toBeNull();
    expect(screen.getByText("Image: Architecture diagram")).toBeInTheDocument();
    expect(screen.getByText("Image: Invisible tracker")).toBeInTheDocument();
    expect(container.querySelector("[src], [onerror]")).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "javascript&#58;alert(1)",
    "java&#x09;script:alert(1)",
    "data:text/html,attack",
    "vbscript:attack",
    "//tracker.example/path",
    "/%5ctracker.example/path",
    "https://user:password@example.com/",
    "mailto:member@example.com?subject=hello%0aInjected"
  ])("keeps an unsafe link inert: %s", (href) => {
    render(<ProposalMarkdown>{`[Untrusted destination](${href})`}</ProposalMarkdown>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Untrusted destination")).toBeInTheDocument();
  });

  it("keeps legitimate external links private and local navigation usable", () => {
    render(<ProposalMarkdown>{[
      "[ZCG](https://zcashcommunitygrants.org/)",
      "[Contact](mailto:team@example.com)",
      "[Community](/communities/orchard)",
      "[Milestones](#milestones)",
      "[Related](../proposals/related)",
      "[Document](https://example.com/community%20proposal.md)"
    ].join("\n\n")}</ProposalMarkdown>);

    expect(screen.getByRole("link", { name: "ZCG" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "ZCG" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "mailto:team@example.com");
    expect(screen.getByRole("link", { name: "Community" })).toHaveAttribute("href", "/communities/orchard");
    expect(screen.getByRole("link", { name: "Milestones" })).toHaveAttribute("href", "#milestones");
    expect(screen.getByRole("link", { name: "Related" })).toHaveAttribute("href", "../proposals/related");
    expect(screen.getByRole("link", { name: "Community" })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "Document" })).toHaveAttribute("href", "https://example.com/community%20proposal.md");
  });

  it("keeps executable-looking code visible as text for technical proposals", () => {
    const { container } = render(<ProposalMarkdown>{'```html\n<script>alert("example")</script>\n```'}</ProposalMarkdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByLabelText("Code block")).toHaveTextContent('<script>alert("example")</script>');
  });
});
