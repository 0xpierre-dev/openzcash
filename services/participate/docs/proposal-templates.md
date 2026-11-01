# Proposal topics and Markdown templates

Updated 2026-10-09.

The proposal editor offers two reusable Markdown models and one fictional filled example. They use original English prompts adapted from public Zcash grant submission structures. They are community DAO proposals; creating one does not submit anything to Zcash Community Grants (ZCG) or the Coinholder Grants Program, and neither program endorses this application.

## Choose a model

| Model | Use it for | Main evidence |
| --- | --- | --- |
| Community grant | Work planned for the community | Budget, deliverables, milestones and acceptance criteria |
| Retroactive grant | Work already completed | Completion records, reviewer acceptance, impact and funding disclosures |
| Filled example | Learning how to describe a proposal | Fictional education project; replace all illustrative content |

Both grant models ask for the applicant and team, budget, prior and other funding, conflicts and supporting links. The prospective model adds dependencies, risks, a delivery plan and progress reporting. The retroactive model asks for completion dates and evidence of actual results; future or incomplete work belongs outside that request.

## Prepare and submit

1. Start a new proposal and choose a template, or download its Markdown file.
2. Replace every bracketed prompt. Use “None” where appropriate, and remove irrelevant example rows.
3. Select up to three topic tags. Enter the title, funding source, requested USD amount and voting dates in the form separately. Template text never fills these fields or configures the voting rules.
4. Check that the requested amount, budget and milestone allocations agree. Disclose previous, pending and other funding, and exclude overlapping reimbursement.
5. Preview the Markdown, verify public evidence links and save a draft for review. Saving or publishing a proposal does not itself reserve, spend or transfer funds.

Use **Import .md** to load a UTF-8 `.md` or `.markdown` file with up to 40,000 characters. Importing and applying a template both ask before replacing existing text; neither changes the title, tags, funding or voting dates. **Write** and **Preview** share the same draft. The preview and saved proposal render headings, tables and checklists; raw HTML is ignored and remote images are shown as text to avoid contacting an author's image host.

The templates use fixed USD budgets, payable in ZEC at the rate on each payment day. No exchange rate or ZEC payment amount is fixed at submission. Record the quote source and time when paying. If estimating costs in a different currency, include the original amounts and dated conversion basis. Zcred are participation credits, not proposal funding. See [USD budgets and ZEC payments](./proposal-funding.md) for the implementation boundary.

Keep personal wallet secrets and private personal information out of the public body. Supporting evidence can be linked without reproducing private records. A checked Markdown checklist is an applicant statement, not independent verification by the application.

## Topic tags and workflow status

Colored topic chips make proposals easier to scan. The catalog adapts the source category dropdowns: Security, Infrastructure, Community, Education, Applications, Integration, Wallets, Research & development, Media, Protocol, Dedicated resources and Events. Retroactive identifies completed-work requests. Shortened names and chip colors are local design choices.

ZCG's actual GitHub labels describe workflow, including Grant Application, Ready For ZCG Review, Grant Approved, Grant Declined, Milestone Payment Complete and Grant Complete. The Coinholder repository uses labels such as Ready For Vote, Approved by Coinholders, Rejected by Coinholders and Funds Disbursed by Keyholders. Its form has an event category for retroactive work and omits the ZCG Security category.

Those workflow labels are different from user-selected topics. A topic never establishes approval, payment, identity verification or affiliation. The application derives proposal status from its own lifecycle and voting results; approval and disbursement remain separate events. Local colors are adapted for light/dark readability rather than represented as official category colors, because neither source publishes category-label colors in its GitHub label inventory.

## Source mapping

Sources verified on 2026-10-09:

- [ZCG application template](https://github.com/ZcashCommunityGrants/zcashcommunitygrants/blob/bce86883b7bb9b0e1a6d4ef8b5939786484847c5/.github/ISSUE_TEMPLATE/grant_application.yaml), commit `bce86883b7bb9b0e1a6d4ef8b5939786484847c5`: applicant/team, problem and approach, budget, risks, success metrics, milestone amounts/dates, deliverables and user acceptance.
- [Coinholder retroactive application template](https://github.com/Financial-Privacy-Foundation/ZcashCoinholderGrantsProgram/blob/749fc02057bb0bdd9ae5e9ca64c7a199a44c146b/.github/ISSUE_TEMPLATE/grant_application.yaml), commit `749fc02057bb0bdd9ae5e9ca64c7a199a44c146b`: completed-work scope, completion period, costs, previous/other support, measured impact and verifiable completion evidence.
- Live GitHub labels: [ZCG](https://github.com/ZcashCommunityGrants/zcashcommunitygrants/labels) and [Coinholder](https://github.com/Financial-Privacy-Foundation/ZcashCoinholderGrantsProgram/labels). Labels are repository metadata and can change independently of template commits.

The source programs' legal terms, KYC thresholds, forum submission requirements, quarterly voting arrangements and keyholder powers are not copied into community governance. Each DAO retains its configured rules. The templates are guidance, and individual Markdown sections are not new server-enforced requirements.

The ZCG repository contains a MIT license inherited from its site theme; the Coinholder repository has no license file at the pinned revision. These models therefore use original explanatory wording and a source-attributed structure rather than reproducing long descriptions or legal terms.

## Files

The editor's template content is defined in `lib/domain/proposal-templates.ts`. The downloadable artifacts are:

- `Z_DAO_Community_Grant_Template.md`
- `Z_DAO_Retroactive_Grant_Template.md`
- `Z_DAO_Community_Education_Example.md`

The filled example is explicitly fictional. Its USD 6,000 cost breakdown and milestone allocations agree, but its links must be supplied and facts replaced before a real submission.
