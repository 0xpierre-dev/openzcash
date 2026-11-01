const ZCG_TEMPLATE_URL = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/blob/bce86883b7bb9b0e1a6d4ef8b5939786484847c5/.github/ISSUE_TEMPLATE/grant_application.yaml";
const COINHOLDER_TEMPLATE_URL = "https://github.com/Financial-Privacy-Foundation/ZcashCoinholderGrantsProgram/blob/749fc02057bb0bdd9ae5e9ca64c7a199a44c146b/.github/ISSUE_TEMPLATE/grant_application.yaml";

/** Original community templates adapted from the linked public submission models. */
export const PROPOSAL_TEMPLATES = [
  {
    id: "community-grant",
    title: "Community grant",
    description: "Plan the work, budget and milestones.",
    source: { label: "ZCG application model", url: ZCG_TEMPLATE_URL },
    filename: "Z_DAO_Community_Grant_Template.md",
    body: `# [Project title]

> Replace the brackets before submitting. Set the proposal title, topic tags, funding source, requested amount in USD and voting dates in the form separately. Markdown does not populate those fields or schedule payments.

## Summary

[Describe the decision requested and the benefit to this community in two sentences.]

## Applicant and team

- Lead: [Public name or community handle; relevant experience]
- Contributors: [Roles, responsibilities and experience, or None]
- Public contact: [Profile or discussion link]

## Problem and proposed work

- Need: [Who is affected, and what is missing?]
- Solution: [What will you deliver? Include the format and scope.]
- Dependencies: [People, resources or permissions required, or None]
- Approach: [Methods and tools; upstream coordination and license if relevant]
- Out of scope: [What this request will not cover]

## Budget

- Requested: [0.00] USD
- Funding source: [Community or Sustainability treasury]
- Payment: ZEC at the USD/ZEC rate on each payment day; record the quote source and time
- Initial allocation: [0.00] USD, included in the total below
- Initial allocation purpose: [Reason, or None]

| Cost | Amount (USD) | Basis |
| --- | ---: | --- |
| Team compensation | [0.00] | [Hours and rate, or fixed deliverable] |
| Tools and materials | [0.00] | [Items and quantities] |
| External services | [0.00] | [Service and scope] |
| Total requested | [0.00] | [Must match the requested amount in the form] |

If estimating costs in another currency, state the currency, dated conversion source and who bears price changes. Zcred participation credits are not the funding unit.

## Milestones and acceptance

| Milestone | Target date | Allocation (USD) | Deliverable | Acceptance evidence and reviewer |
| --- | --- | ---: | --- | --- |
| [1] | [YYYY-MM-DD] | [0.00] | [Concrete output] | [How intended users will verify it; who reviews] |
| [2] | [YYYY-MM-DD] | [0.00] | [Concrete output] | [How intended users will verify it; who reviews] |

- User need: As a [participant], I need [capability] to [achieve an outcome].
- Schedule: [Start and completion dates; relevant dependencies]
- Allocation check: [Milestone allocations include any initial allocation and sum to the requested total.]
- Progress updates: [Where and how often the community will receive updates]

## Success, risks and disclosures

- Success measures: [Measurable targets and how evidence will be collected]
- Delivery risks: [Risk, mitigation and fallback]
- Possible side effects: [Privacy, accessibility or other impacts, or None]
- Prior funding: [Amount, source, funded scope and outcome, or None]
- Other funding: [Received, pending or planned funding and overlapping scope, or None]
- Overlap adjustment: [Costs excluded from this request to avoid duplicate reimbursement]
- Conflicts of interest: [Relevant relationships, or None]

## Supporting links

- [Relevant repository, public plan or supporting document]

## Before submitting

- [ ] The budget, milestones and separate form amount agree.
- [ ] Deliverables have clear acceptance evidence and a named reviewer.
- [ ] Prior and other funding are disclosed; the same work is not charged twice.
- [ ] Public links work, and no private keys or private personal information are included.

Adapted for community DAOs from the [ZCG application model](${ZCG_TEMPLATE_URL}). This is a community template, not an application to ZCG.
`
  },
  {
    id: "retroactive-grant",
    title: "Retroactive grant",
    description: "Document completed work and its impact.",
    source: { label: "Coinholder application model", url: COINHOLDER_TEMPLATE_URL },
    filename: "Z_DAO_Retroactive_Grant_Template.md",
    body: `# [Completed project title]

> Use this model for completed work. Replace the brackets before submitting. Set the proposal title, topic tags, funding source, requested amount in USD and voting dates in the form separately. Markdown does not populate those fields or schedule payments.

## Summary and request

[Summarize the completed work, its value to the community and the funding decision requested.]

- Applicant: [Public name or community handle; relevant experience]
- Contributors: [Roles and responsibilities, or None]
- Completion period: [Start date to completion date]
- Requested: [0.00] USD
- Funding source: [Community or Sustainability treasury]
- Payment: ZEC at the USD/ZEC rate on each payment day; record the quote source and time

## Work completed

- Outputs: [What was delivered and where it is available]
- Approach: [Methods, tools, relevant versions and license if applicable]
- Scope boundary: [Unfinished or future work, if any, excluded from this request]

## Completion evidence

| Output | Completed on | Public evidence | User or reviewer acceptance |
| --- | --- | --- | --- |
| [Deliverable] | [YYYY-MM-DD] | [Commit, release, publication or other link] | [Reviewer and dated acceptance record] |

Link to evidence for the delivered outcome. Distinguish a draft from a published result and a deployment from demonstrated use.

## Community impact

| Measure | Observed result | Period and evidence |
| --- | --- | --- |
| [Use, reach or other outcome] | [Actual result] | [Date range and evidence link] |

[Explain limitations, relevant feedback and how the completed work benefits this community.]

## Costs and funding

| Cost | Incurred value (USD) | Requested here (USD) | Basis |
| --- | ---: | ---: | --- |
| Compensation | [0.00] | [0.00] | [Completed work and rate] |
| Tools or infrastructure | [0.00] | [0.00] | [Items and period] |
| External services | [0.00] | [0.00] | [Service delivered] |
| Total | [0.00] | [0.00] | [Match the separate form amount] |

If costs were incurred in another currency, state the original amounts and dated conversion basis. Explain any difference between cost incurred and funding requested. Zcred participation credits are not the funding unit.

- Prior funding: [Source, amount, dates, covered outputs and outcome, or None]
- Other funding: [Received, pending or planned funding for this work, or None]
- Overlap adjustment: [Amounts excluded to prevent duplicate reimbursement]
- Conflicts of interest: [Relevant relationships, or None]
- Public contact or discussion: [Link]

## Before submitting

- [ ] The funded scope is complete, and its evidence can be checked.
- [ ] Intended users or reviewers have verified the outputs; their acceptance is linked.
- [ ] The requested amount excludes costs already funded elsewhere.
- [ ] Amounts match the form, and public evidence contains no private keys or private personal information.

Adapted for community DAOs from the [Coinholder retroactive application model](${COINHOLDER_TEMPLATE_URL}). This is a community template, not an application to that program.
`
  },
  {
    id: "filled-example",
    title: "Filled example",
    description: "A fictional community education proposal.",
    source: { label: "Based on the ZCG application model", url: ZCG_TEMPLATE_URL },
    filename: "Z_DAO_Community_Education_Example.md",
    body: `# Two privacy workshops for Orchard Collective

> Fictional example only. All people, plans, amounts and results below are illustrative. No event, funding approval or payment is represented as real. Replace this content before submitting.

## Form values to enter separately

- Proposal title: Two privacy workshops for Orchard Collective
- Topics: Education, Community, Events
- Funding source: Community treasury
- Requested amount: 6000.00 USD
- Voting dates: Choose appropriate future dates in the form; Markdown does not set them.

## Summary

Request 6000.00 USD for two beginner workshops and a reusable English guide. Participants will practice wallet setup and private payments with test funds, then provide feedback on the guide.

## Applicant and team

- Alex Example, facilitator: Fictional community educator responsible for materials, teaching and reporting.
- Sam Sample, reviewer: Fictional contributor responsible for accessibility review and checking the final deliverables.
- Public contact: Add the project discussion link before submitting.

## Problem and proposed work

New members need a guided way to learn basic wallet operations without risking personal funds. The team will run two small workshops and publish a guide that another community can reuse.

- Deliverables: Two sessions, an English guide, an anonymous feedback summary and an expense report.
- Dependencies: A venue, volunteer reviewers and a suitable test wallet.
- Approach: Demonstrations followed by participant exercises; guide source and illustrations released under CC BY 4.0.
- Out of scope: Mainnet payments, wallet development, investment advice and collecting participant wallet balances.

## Budget

| Cost | Amount (USD) | Basis |
| --- | ---: | --- |
| Facilitation and preparation | 3000.00 | Materials and two sessions |
| Venue and connectivity | 1000.00 | Two bookings |
| Accessible guide and illustrations | 1000.00 | Reusable digital materials |
| Feedback, review and report | 1000.00 | Review and final publication |
| Total requested | 6000.00 | Enter 6000.00 USD in the form |

The budget is fixed in USD and payable in ZEC at the rate on each payment day. No exchange rate or ZEC payment amount is assumed. The initial allocation is 2000.00 USD within the first milestone, not an additional request.

## Milestones and acceptance

| Milestone | Target | Allocation (USD) | Deliverable | Acceptance |
| --- | --- | ---: | --- | --- |
| Preparation | Week 1 after approval | 2000.00 | Draft guide, venue plan and test exercise | Reviewer checks safety and accessibility; community reviews the plan |
| Workshops | Weeks 2–3 | 3000.00 | Two sessions and revised guide | Session records and anonymous feedback reviewed by participants |
| Final report | Week 4 | 1000.00 | Published guide, impact summary and expense report | Reviewer checks links, agreed scope and the 6000.00 USD budget |

As a new member, I want to practice a private payment with test funds so I can understand the steps before using my own funds. Progress updates will be posted weekly in the proposal discussion.

## Success, risks and disclosures

- Targets: 20 total attendees, at least 15 completed practice exercises and one publicly reusable guide. These are targets, not reported results.
- Measurement: Aggregate attendance and voluntary anonymous feedback; no addresses, balances or identifying transaction records collected.
- Risks: If turnout is low, offer one repeat session within the same budget. If the venue is unavailable, use an online session.
- Accessibility: Provide written instructions and a recording only with explicit participant consent.
- Prior funding: None in this fictional example.
- Other funding: None received, pending or planned in this fictional example.
- Duplicate reimbursement: No cost is charged to another grant; any later overlap will be disclosed and removed from the request.
- Conflicts: None in this fictional example; replace with actual disclosures.

## Evidence to add before publication

- Public planning and discussion link: Replace with a real link.
- Draft guide and license: Replace with a real link.
- Reviewer acceptance: Add a dated record after review.
- Final guide and report: Add working links when delivered.

## Submission check

- [ ] Replace fictional names, amounts, dates and placeholders with verified details.
- [ ] Ensure the form amount and milestone allocations both total 6000.00 USD, or update both together.
- [ ] Review the draft with the community before opening voting.

Original educational example adapted from the [ZCG application structure](${ZCG_TEMPLATE_URL}); no affiliation or endorsement is implied.
`
  }
] as const;

export type ProposalTemplateId = (typeof PROPOSAL_TEMPLATES)[number]["id"];
