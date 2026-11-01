import { render, screen } from "@testing-library/react";
import { WorkspaceVotePreviewBar } from "@/components/workspace-vote-preview";

describe("workspace simulated vote bar", () => {
  it("identifies the outcome and figures as simulated in both visible and accessible text", () => {
    render(<WorkspaceVotePreviewBar vote={{ outcome: "approved", yes: 10, no: 2, eligible: 12 }} />);
    expect(screen.getByRole("img", { name: "Simulated vote approved: Yes 10 (83.3%), No 2 (16.7%). 12 of 12 eligible members voted." })).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeInTheDocument();
    expect(screen.getByText("12 / 12 voted")).toBeInTheDocument();
  });

  it("calculates option percentages from votes cast rather than from eligible members", () => {
    const { container } = render(<WorkspaceVotePreviewBar vote={{ outcome: "ongoing", yes: 5, no: 2, eligible: 12 }} />);
    expect(screen.getByRole("img", { name: "Simulated vote ongoing: Yes 5 (71.4%), No 2 (28.6%). 7 of 12 eligible members voted." })).toBeInTheDocument();
    expect(screen.getByText("7 / 12 voted")).toBeInTheDocument();
    const yes = container.querySelector<HTMLElement>(".dao-vote-yes")!;
    const no = container.querySelector<HTMLElement>(".dao-vote-no")!;
    expect(parseFloat(yes.style.width)).toBeCloseTo(5 / 7 * 100);
    expect(parseFloat(no.style.width)).toBeCloseTo(2 / 7 * 100);
  });
});
