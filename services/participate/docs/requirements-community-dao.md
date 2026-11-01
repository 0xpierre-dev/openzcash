# Zcash Community DAO Requirements and Roadmap

*Product specification and implementation sequence*

Version 1.5 | Reviewed 10 October 2026

We will evolve community shielded voting into a platform for small communities that manage their own membership, proposals, voting, and accountability. The first implementation priority is isolation between communities, because every later governance workflow depends on consistent ownership and permissions.

This specification defines 51 requirements and two optional capabilities. R01–R41 retain their identifiers; R42–R51 capture subsequent product decisions. Each requirement retains its acceptance criterion and origin. Candidate pilot values remain configurable policy proposals; they do not represent institutional approval. This catalog defines the product target, not current implementation status. See the [implementation review](./implementation-status.md) for evidence and the [delivery roadmap](./roadmap.md) for the next work.

The product team should use the acceptance criteria to implement and review each delivery. Community governance bodies must resolve the policy decisions before enabling the workflows they control. Cryptographic voting integration requires a separate compatibility demonstration.

## Scope and terminology

A community owns its private administrative records. A parent DAO may delegate authority to a committee or subordinate DAO. Each proposal has its own discussion area. Comments and formal written reviews remain separate from ballots. A voting round freezes its eligible voters, choices, content, dates, and rules. Closing a round stops new votes; tally finalization establishes which valid votes meet the cutoff. Final authorization and confirmed payment are later states.

The terms must and acceptance describe required behavior. Candidate parameters describe values awaiting validation. Optional items may be enabled by a community. Derived engineering requirements address integrity or privacy needs in the existing system rather than a specific forum statement.

Coinholder or Valar voting-engine integration is a technical option to investigate. Equal weight per member must be demonstrated before relying on that engine. Historical Coinholder analytics belongs in OpenZcash, outside this DAO's primary navigation. Automatic payments, a transferable platform token, reputation scores, automatic fraud detection, and a dedicated forum are outside the established requirements. Internal Zcred usage credits are in scope under R43 and never buy governance weight.

## Reading order

Read the [implementation review](./implementation-status.md), then the [current roadmap](./roadmap.md). The catalog below retains the original governance workstreams and their acceptance gates. Candidate pilot parameters and the decision register identify what must remain configurable or unresolved. The references map forum post numbers to their original discussion locations. Committee-specific requirements apply when that governance profile is enabled; the example six-seat committee is not the default policy for every small DAO.

## Governance workstreams

These workstreams retain the original coverage map, rather than prescribing the current delivery order. The review found that closing and finalizing votes must be separated before expanding binding membership actions. Follow the current roadmap for sequencing. R05 is a historical preparation requirement; this distribution is prepared for a separately approved public release.

### 1 Community isolation

Introduce communities with owner and manager memberships, scope member and poll records, and enforce administrative authorization that denies access unless membership and permission are established. Apply ownership checks to private reads and writes, including invitations, ballots, collectors, and exports.

Acceptance gate  Two communities can operate independently. Attempts to read or modify another community's private records fail. Legacy rows remain preserved and require explicit community assignment. Migration does not automatically broaden permissions. Targeted isolation tests and the existing regression suite pass.

Coverage  R01 R06

### 2 Governance and stable membership

Add delegated authority, separate permissions, appointment history, recusals, alternates, and a frozen eligible voter snapshot.

Acceptance gate  Member changes cannot alter an open round. One seat cannot cast two counted votes. Permission and recusal behavior matches the published policy. Decisions D02, D03, and D07 are recorded.

Coverage  R07 to R12; R21

### 3 Intake and versioned proposals

Preserve intake and appeals, configure scope and funding limits, version proposals, and commit the content and rules to Zcash. Add a proposal discussion area for questions and comments under the community participation and visibility policy.

Acceptance gate  Published versions remain recoverable and immutable. Chain inclusion is confirmed. Referral and appeal history is preserved. Exact threshold, tie, abstention, and vote replacement tests pass. Authorized participants can post and read proposal comments without exposing private ballot data. Decisions D02, D05, D09, D10, and D11 are recorded.

Coverage  R02 to R04; R13 to R20; R21 to R23; R40

### 4 Privacy tally and veto

Apply the publication policy, separate closing from final tally, persist duplicate prevention, and defer execution until veto resolves.

Acceptance gate  Votes meeting the cutoff survive late collection. Retry and concurrent collection do not duplicate votes or execution. Veto prevents premature execution. No individual choice leaks through receipts, APIs, minutes, or exports under the selected policy. Decisions D01, D04, D05, and D06 are recorded.

Coverage  R24 to R30

### 5 Reviews and budgets

Record versioned reviews, distinguish missed obligations and recusals, calculate review compensation eligibility, and track budget reservations, commitments, and confirmed payments.

Acceptance gate  Concurrent decisions cannot overspend. Reviews and compensation calculations are reproducible. Approved decisions and confirmed payments remain distinct. Decision D08 is recorded.

Coverage  R31 to R36

### 6 Reporting and pilot operation

Generate privacy-aware minutes and metrics, record continuation decisions, and conduct a limited pilot using an approved policy profile.

Acceptance gate  Reports reproduce the underlying records without exposing individual choices. Pilot dates, funding, authority, and success criteria are approved. Continuation or closure preserves history and remaining-fund handling.

Coverage  R37 to R39; optional O01 and O02

## Foundation acceptance and verification

The community foundation is present locally. Preserve owner and manager memberships and scoped member and poll records. Resolve the active community from authenticated context and validate object ownership in the service layer. Administrative authorization must deny access unless membership and permission are established. Restrict every private read and write, including indirect operations such as collectors and exports. These remain acceptance obligations for R06 as features are added.

Preserve legacy rows during migration. Require explicit assignment to a community before treating those records as community-owned. Do not automatically broaden access or infer ownership from shared legacy administrative privileges.

Verify isolation using at least two communities, including direct access by guessed identifiers, list filtering, unauthorized mutations, invitations, voting records, tally access, and exports. Run targeted isolation tests and the existing regression suite. Review migration and rollback behavior before production use.

Record evidence separately for local implementation, automated tests, pull request review, merge, deployment, and live verification. A completed earlier stage does not establish completion of a later stage.

## Core requirements

The catalog preserves R01–R41 and adds R42–R51 from subsequent user decisions. Source labels refer to forum post numbers, the user request, or explicitly identified engineering requirements. Acceptance criteria describe the completion evidence to be demonstrated.

## Product direction

### R01 Small community governance

The platform must serve small communities with their own governance and private voting.

Acceptance  A community can manage members and publish, vote on, and close a proposal without accessing another community's administrative data.

Source  User request; post 18

### R02 Verifiable Zcash commitment

Proposals must have a verifiable commitment and a time record on Zcash.

Acceptance  The system provides verifiable content, its commitment, the transaction, and evidence of inclusion in the chain. A pending submission identifier does not count as a confirmed record.

Source  Post 18

### R03 Immutable published proposals

A published proposal must be immutable and preserved.

Acceptance  Later changes create a new version linked to the previous one. Rejection, archival, or replacement never deletes or overwrites the original record.

Source  Post 18

### R04 Participation without Juno or Cosmos

Community operations must not require Juno or a DAO on Cosmos.

Acceptance  Registration, eligibility, and product participation do not depend on owning Juno or having a Cosmos account.

Source  Post 18

### R05 Controlled source release (updated November 2026)

The historical private preparation stage is superseded by the planned source release.

Acceptance  The reviewed distribution excludes credentials, live databases and private operating records; publication requires explicit owner approval.

Source  Updated release scope, November 2026

## Communities committees and responsibilities

### R06 Community isolation

Each community must have its own members, permissions, policies, and proposals.

Acceptance  Identifiers from another community cannot enable private reads or changes to members, proposals, invitations, tallies, or exports.

Source  User request; required adaptation of the existing system

### R07 Delegated committees

The platform must support committees or subordinate DAOs under a parent DAO.

Acceptance  Delegated authority, scope, and limits are recorded. Under the applicable policy, the parent DAO can appoint or remove members, change future configuration, and close the committee.

Source  Posts 6 to 8

### R08 Appointments and member history

Selection criteria, applications, declared interests, terms, and alternates must be recordable.

Acceptance  Appointments and replacements include a decision, reason, date, and history. They cannot be performed as silent administrative edits.

Source  Posts 5 to 10

### R09 Separation of responsibilities

Coordination, review, voting, payment authorization, and accountability must have separate permissions.

Acceptance  Coordination can be configured without voting rights. Holding one role does not automatically grant the others. The actual composition follows the committee policy.

Source  Post 10

### R10 Published selection policies

Policies must support criteria for expertise, participation, independence, and regional distribution.

Acceptance  Applications are evaluated against published criteria. The geographic unit and the seats to which each limit applies are explicit.

Source  Posts 5 to 10

### R11 Recusals absences and vacancies

The system must record recusals, absences, and vacancies for each proposal.

Acceptance  A recused person cannot review or vote where the policy prohibits it. Recusal is distinguished from absence and abstention.

Source  Posts 8 to 10

### R12 Stable quorum during voting

Recusals and vacancies must not silently reduce the quorum of an open vote.

Acceptance  The rule and set of seats remain frozen for the round. Replacements follow an explicit policy and cannot produce two votes for the same seat.

Source  Posts 8 to 10; voting integrity

## Intake scope and referrals

### R13 Complete request information

Requests must record their objective, beneficiary or initiative, amount, duration, history, funding sources, and references.

Acceptance  Triage has the information needed to compare the request with the scope and budget.

Source  Post 8; posts 11 to 17

### R14 Preserved intake records

Every received request must be recorded, including requests classified as outside the scope.

Acceptance  The applicant can find its status, responsible party, reason, and referral. A triage rejection does not make the request disappear.

Source  Post 10

### R15 Appeals against scope decisions

The platform must support appeals against scope decisions.

Acceptance  The policy states who may appeal, the required number of supporters, and the reviewing body. The appeal remains linked to the original decision.

Source  Post 10

### R16 Scope classification

Triage must distinguish emerging initiatives, routine activities of established communities, and other proposal types.

Acceptance  A low amount alone does not make a request eligible for the community committee.

Source  Posts 11 to 17

### R17 Referral to existing budgets

Routine work already covered by a funded community must be referred to the corresponding budget or responsible party.

Acceptance  Referral considers existing coverage and records exceptions without granting territorial exclusivity to the local team.

Source  Posts 13 to 18

### R18 Related requests and funding overlap

Reviewers must be able to identify and record overlapping requests and funding.

Acceptance  Related requests, existing coverage, and reasons for additional funding are linked. The system does not presume fraud or automatically reject every initiative from the same location.

Source  Posts 14 to 17

### R19 Configurable funding limits

Limits for tranches, duration, continuity, and exceptions must be configurable and verifiable.

Acceptance  The policy defines the unit used to count continuity. Exceptions and renewals have approval and history.

Source  Posts 8 and 12

### R20 Applicant guidance

New applicants must receive referral guidance before submitting to the wrong body.

Acceptance  The interface explains eligibility, limits, and the party responsible for the next step.

Source  Posts 13 to 17

## Proposals voting and finalization

### R21 Frozen voting configuration

The eligible voter list, choices, content, dates, and rules must be frozen and committed before voting.

Acceptance  Changing any committed element requires an identifiable new version or round. Later membership changes do not change the denominator of the round.

Source  Posts 8 and 18; integrity of the existing system

### R22 Explicit decision rules

Quorum, approval, ties, and abstention must have explicit semantics for each round.

Acceptance  The policy distinguishes absolute and percentage quorum, minimum participation, the approval denominator, and strict or inclusive comparisons. Decisions do not use rounded percentages.

Source  Posts 8 to 10

### R23 Voting again within an open round

The platform must support a policy for replacing a vote during the open voting window.

Acceptance  The policy defines when and how a new vote replaces an earlier vote without increasing the eligible voter's weight. After the cutoff, the result is not silently replaced. The mechanism depends on the voting engine.

Source  Post 8

### R24 Individual choice privacy

An individual choice must not be published automatically in interfaces, minutes, or exports.

Acceptance  Publication follows the privacy policy defined before the round. Receipts, APIs, and minutes do not expose another voter's choice. Secret voting is the current direction; its relationship with signed reviews remains unresolved.

Source  Post 18; conflict with post 8

### R25 Publication policy for small groups

Publication of participation and results must follow an explicit policy appropriate for small groups.

Acceptance  The system distinguishes information available during voting, a provisional tally, and the final result. The policy explains the risk of inferring choices from partial results and reviews.

Source  Post 18; derived privacy requirement

### R26 Separate closing and tally finalization

Closing voting and finalizing the tally must be separate stages.

Acceptance  A vote included before a verifiable cutoff can be collected later without being lost. Collector delay or failure keeps the tally pending and prevents execution.

Source  Evolution of the existing system; required integrity

### R27 Persistent confirmation and deduplication

Confirmation and duplicate prevention must use persistent evidence.

Acceptance  Concurrent collectors, retries after failure, and repeated finalization calls do not duplicate votes or execution. Rejection reasons are verifiable.

Source  Evolution of the existing system

### R28 Provisional approval during veto

A favorable result subject to veto must remain provisional.

Acceptance  Member admission or removal, final grant authorization, and execution do not occur while a veto is pending or its window remains open.

Source  Posts 8 to 10

### R29 Feasible veto procedure

The veto window must allow the authorized body to complete its process.

Acceptance  Configuration incompatible with the duration of the higher body's procedure is rejected. The policy defines the window's start and end, authority, procedure, and veto effect.

Source  Post 10

### R30 Referral when decision capacity is insufficient

Availability below the minimum decision capacity must trigger referral to the higher body.

Acceptance  Recusals, absences, and vacancies are assessed before the decision. Referral preserves content, history, and reason.

Source  Posts 8 to 10

## Review budgets and accountability

### R31 Written reviews

Each eligible reviewer must be able to record a written review before voting closes.

Acceptance  The review covers the objective, budget, and history. Its date and version are preserved. Recommendation visibility follows the privacy policy.

Source  Posts 5 to 8 and 18

### R32 Distinct consequences for missed reviews

Missed obligations, authorized absences, and recusals must have different effects.

Acceptance  Only a required review not delivered by its deadline counts as a missed obligation. Applying removal criteria starts a process before the competent authority.

Source  Post 8

### R33 Compensation for review work

Review compensation must depend on the required work and must not pay for voting.

Acceptance  Eligibility for a period can be calculated from required and delivered reviews. An authorized recusal does not count as a missed review. Amount and frequency come from the policy.

Source  Posts 6 to 10

### R34 Budget balances and commitments

Budget lines must distinguish available, reserved, committed, and paid funds.

Acceptance  Two concurrent decisions cannot authorize spending above the uncommitted balance. Every movement references its decision and budget line.

Source  Posts 7 to 10

### R35 Budget limits and pauses

The platform must support budget line limits and pauses by the defined authority.

Acceptance  A pause records its scope, reason, and date. Its effects on new decisions, existing commitments, and payments follow an explicit policy.

Source  Post 10

### R36 Separate request grant and payment states

Requests, grants, and payments must remain separate states.

Acceptance  Payment requires a receipt or transaction ID and confirmation. Currency, exchange rate, and conversion date are recorded. An approved vote is not shown as a completed payment.

Source  Post 8; evolution of the existing system

### R37 Reproducible minutes and reports

Minutes and reports must be generated from existing records.

Acceptance  They include received and referred requests, reviews under the visibility policy, recusals, result and reason, budget, and execution. They show amounts, seats, and recusals by continent, distinguishing requests, grants, and payments. Individual named votes are excluded by default.

Source  Posts 8, 10, and 17 to 18

### R38 Committee evaluation metrics

Committee evaluation must measure incoming initiatives and decision performance.

Acceptance  Metrics distinguish new cases from appeals and resubmissions. They show quorum, voting duration, referrals, reviews, minutes publication, and costs.

Source  Posts 8 and 10

### R39 Recorded pilot continuation decisions

Pilot continuation, change, or closure must depend on a recorded decision.

Acceptance  The period or term has explicit start and end dates. Closure does not delete proposals, and remaining funds follow the applicable policy.

Source  Posts 7 to 8

## Proposal discussion

### R40 Proposal comments

Each proposal must provide a discussion area for questions and comments within the platform.

Acceptance  Authorized participants can post and read comments on the proposal page. Each comment displays its author label, timestamp, and text. Reading and posting follow the proposal and community access policy; guessed identifiers cannot expose another community's private discussion. Comments remain separate from formal written reviews and ballots, do not count as votes, and do not automatically disclose or link private ballot choices. The policy defines participation, visibility, editing, moderation, and access after voting closes.

Source  User request, 8 October 2026; access and ballot separation are derived engineering requirements.

## Member identity and admission

### R41 ZcashNames membership and community-selected management

Communities must be able to identify prospective members by ZcashNames and independently add or remove membership in their own DAO. Each DAO selects either authorized leader management or membership changes through voting. A name lookup alone must not grant account access, voting rights, or administrative authority.

Acceptance  Resolve names through the explicitly selected provider and network. Bind a verified identity to a stable internal account before enabling that identity's access. A member may belong to multiple communities; removal affects only the selected community. Record the actor, reason, effective date, and policy version for each change, plus the authorizing proposal when voting is required. Preserve history and already frozen voting eligibility. Names that are sold, transferred, renamed, or redirected must not silently transfer DAO privileges. Policy changes are authorized and recorded, and cannot bypass an in-flight governance decision. Signal delivery is separate from identity and must not remain a mandatory member identifier once the replacement access/delivery flow is operational.

Source  User direction and explicit selection of per-DAO leader-managed or vote-governed membership, 8 October 2026; identity binding and integrity safeguards are derived engineering requirements. See [ZcashNames membership integration](./zcashnames-membership.md) for verified implementation references and remaining integration work.

## Subsequent product decisions

### R42 Community and sustainability treasuries

Each DAO must have a Community Treasury for initiatives and a Sustainability Treasury as a reserve. The reserve is funded through manual allocations.

Acceptance  Both funds have distinct identities and exact ZEC accounting. Authorized operations retain their actor, reason and history, preserve community isolation, and cannot allocate more than the available amount. The interface distinguishes recorded budgets from verified wallet balances. Reservation, commitment and payment states follow R34–R36. No automatic percentage allocation is implied.

Source  User decisions, 8 October 2026, including the explicit selection of a reserve with manual allocations.

### R43 Zcred participation credits

The account menu must use **Credits** and the usage unit **Zcred**. Each DAO receives purchases in its own configured wallet. The flow is personal wallet → confirmed payment → credits in that user's DAO account.

Acceptance  The application does not request a seed or create a personal wallet. A fixed invoice separates ZEC price from Zcred quantity. Verified receiving-output evidence grants credits once, including under retries and concurrent checks. Demo grants and real purchases remain separate. Comments and likes disclose costs before charging and commit the action and debit together. Credits never grant membership, votes, quorum or spending authority. Exceptions and chain changes have an auditable recovery policy before paid operation. Receiving a payment does not silently create a second treasury record.

Source  User decisions on the Free2Z-inspired model, per-DAO receiving wallets, Zcred naming and Credits menu label, 8–9 October 2026; receipt integrity and recovery are derived engineering requirements.

### R44 Public browsing and account settings

Published proposals must be readable before sign-in. Sign-in is available within the workspace. The profile entry must expose account settings, avatar, privacy preferences and Credits.

Acceptance  Guests cannot read drafts or private discussion and cannot mutate proposals. Signing in returns to the intended proposal or action and does not bypass participation rules. Profile preferences apply only to the authenticated account, disclose the audience for shared names/photos, and remain separate from ballot privacy. Invitation sessions retain their poll-scoped access.

Source  User requests for profile settings and removal of the initial login barrier, 8–9 October 2026.

### R45 Consistent DAO interface

Use English UI copy, the standalone Zcash mark, readable light/dark themes, and a compact shared layout. The product name is deferred. Main navigation separates Proposals and DAO; Treasury and Members belong to DAO.

Acceptance  Proposals, detail pages, Members, Treasury and account dialogs share typography, spacing and accessible controls on desktop and mobile. The interface has no redundant Overview page, community-title banner, top-bar community filter, Built on Zcash badge or Sample data badge. Illustrative votes remain distinguishable from real results. Proposal topics use colored tags and Markdown submission examples.

Source  User design and navigation refinements, 8–10 October 2026, including removal of provisional Voice/Sub-DAOs branding and separation of Proposals from DAO. Removing the top-bar selector does not remove the need to choose a community through an authorized entry point.

### R46 Coinholder analytics product boundary

Historical Coinholder analysis belongs to the neighboring OpenZcash product. It must not appear as a primary DAO menu entry or be represented as voting activity of a small community.

Acceptance  DAO navigation stays focused on its own proposals, funds and members. Legacy analytics routes and data are explicitly documented until retired. Any future voting-engine reuse requires a separate compatibility decision under D06; migration of charts does not establish compatibility.

Source  User decision to migrate Coinholder analysis to OpenZcash and return development to the DAO, 9 October 2026.

### R47 Passkey account access

Offer passkey sign-in in the inline login dialog and standalone login page, with a centered Zcash mark in the dialog. Existing account holders can register and remove their own passkeys from account settings.

Acceptance  Enrollment and removal require password reauthentication. Passkey sign-in verifies a one-use challenge, the configured site identity, user verification and account/key status. Replayed, expired, revoked or cross-account credentials cannot create a session. Password access remains available, and successful sign-in returns to the intended proposal without changing membership or voting permissions. Device enrollment requires the user's confirmation.

Source  User request to center the logo and add passkey access, 9 October 2026. See [implementation and deployment details](./passkeys.md).

### R48 USD budgets with ZEC settlement

Display and request proposal funding in USD. Pay approved USD amounts in ZEC using the quote on each payment day, rather than locking a ZEC amount when the proposal is submitted.

Acceptance  Store exact USD cents separately from ZEC treasury balances. Preserve historical requests in their original currency. Commit the budget and settlement rule before voting. Each future payment records its quote source, time, rate, exact ZEC amount and confirmed payment evidence. Missing or stale quotes cannot authorize payment. Approval does not itself reserve or transfer funds.

Source  User decision on USD display and payment-day ZEC conversion, 9 October 2026. See [funding implementation](./proposal-funding.md).

### R49 USD-priced credits and proposal submission

The purchase price is US$ 0.25 per Zcred. Submitting a new proposal costs 20 Zcred, equivalent to US$ 5. The UI retains Credits as the menu label.

Acceptance  The author sees the exact fee and versioned quote before submission. Saving a draft and importing historical records do not create submission charges. The server uses integer cents and credits, prevents duplicate charges and overspending, and enforces committee/DAO isolation. Credits are purchased with ZEC using an expiring, fixed invoice and are issued only after verified payment. Existing invoices retain their original terms; demo balances remain separate. Fee payment cannot establish committee review, approval, governance weight or a grant award. Recovery and refund handling are implemented before paid activation.

Source  User decision and explicit confirmation of 20 Zcred per proposal, 10 October 2026. See [Proposal publication and Zcash evidence](./proposal-publication-product.md).

### R50 Native proposals with independently verifiable revisions

The Proposals module must accept complete authored proposals, preserve each published version and provide independently verifiable Zcash inclusion evidence.

Acceptance  An authenticated author can review the exact public text and files before publication. The native submission type is distinct from imported metadata and editorial summaries. Each revision remains downloadable, its content commitment is reproducible, and chain evidence identifies the network, memo, transaction and canonical block at the required depth. Pending, failed, unknown and verified states remain distinct. Anchoring commits to a revision; it does not replace durable file storage or certify content truth. No unverified first-to-market claim is published.

Source  User product direction, 10 October 2026; evidence and recovery safeguards are derived engineering requirements.

### R51 GitHub and forum workflow continuity

The proposal workspace must preserve source provenance and support continued use of the existing GitHub and forum application workflow.

Acceptance  Records retain original issue/thread links, source update and check times, and exportable submission text. Local publication, local comments and external committee decisions have separate provenance and states. Paying the platform fee does not mark an application submitted to or accepted by ZCG. External posting is a separately authorized action with duplicate protection. A stale source snapshot cannot silently become a current committee status.

Source  User product direction, 10 October 2026; the official ZCG process checked on the same date. See [Grant process](https://zcashcommunitygrants.org/selection/).

## Optional capabilities

These capabilities are optional. They do not change the core quorum, privacy, or round integrity requirements.

### O01 Reminder before quorum failure

The community may enable a reminder when voting has 48 hours left and remains below quorum.

Acceptance  The reminder does not expose choices or repeat improperly. The community defines its channel and activation.

Source  Post 8

### O02 One resubmission after quorum failure

The community may permit one resubmission with unchanged content after quorum failure with a favorable majority.

Acceptance  The new round is linked to the previous round and marked as a resubmission. Rules distinguish resubmission from replacing a vote in the same round.

Source  Post 8

## Candidate pilot parameters

The following values come from the forum draft and subsequent corrections. They are configuration candidates to validate, rather than global constants or approved institutional policy. The platform must support an approved policy profile without hard-coding this example.

| Policy | Candidate value | Status and unresolved detail |
| --- | --- | --- |
| Composition | Six voters; the draft has three regional reviewers, two independent reviewers, and a core seat. | The correction proposes a coordinator without voting rights and a sixth reviewer. The final number of people and voting seats is unresolved. |
| Regional distribution | Region means continent; no more than two seats per continent, including core. | Proposed correction. Determine whether the limit includes the coordinator without voting rights. |
| Independence | Ratification of independent reviewers by the funder, or no receipt from the budget line in the previous 12 months. | Alternative criteria remain open. |
| Parent DAO candidate participation | Participation in at least 80% of decisions in the previous quarter. | Candidate parameter. Define its denominator and supporting evidence. |
| Candidate incompatibility | Active ZCG members are ineligible for this pilot. | Pilot-specific candidate criterion; not a universal platform restriction. |
| Applications | A two-week open call and a register of alternates. | Candidate parameter. |
| Scope | Ambassadors, local meetups, and emerging communities. | Supported by the later discussion. Routine activities already funded require referral. |
| Tranche | Up to USD 8,000 and up to three months. | Candidate limits, subject to the continuity policy. |
| Continuity | Two consecutive tranches, with exceptions by the parent DAO; ambassador renewal requires accountability. | Candidate parameter. Define whether continuity is counted by beneficiary or initiative. |
| Quorum | An absolute minimum of four votes among six voters. | Interpretation of the draft minimum, to validate against final composition. A 66% threshold must not replace the absolute minimum when composition changes. |
| Approval | More than 50%. | The denominator and effect of abstention remain unresolved. |
| Voting | Seven days, with vote replacement permitted. | Candidate parameters. |
| Veto | At least five days, with veto possible before final approval. | The later correction replaces the draft's three-day window. Temporal milestones remain unresolved. |
| Triage and minutes | Referral within three days; minutes within seven days after voting closes. | Candidate parameters with separate clocks. |
| Reports | Quarterly committee report and monthly recaps for funded initiatives. | Candidate frequencies. Follow-up remains separate from voting. |
| Written review length | Approximately 100 to 200 words per proposal. | Candidate editorial guidance. |
| Availability | Announced absence of up to two weeks per quarter; two consecutive missed obligations or three during the term initiate removal. | Candidate parameters. |
| Review stipend | USD 300 per quarter for each of five reviewers, conditional on all required reviews. | Most recent draft amount, replacing the earlier USD 600 example. Final composition may change eligibility. |
| Budget | USD 50,000 for grants and up to USD 6,000 for reviews; USD 3,000 for the following six-month period depends on continuation. | Candidate scenario. Funding source and the proposed prohibition on using donations were contested. |
| Pilot period | Six months, reviewed after the first quarter and at the end; January 2027 or later activation. | Scenario dates, without a launch commitment or universal dependency on ZCG. |
| Indicators | Voting result within 14 days of submission; complete reviews and minutes; a limit on referrals caused by unavailability; costs within budget. | Draft targets. The 14-day target excludes veto and payment. |

## Policy decision register

Each decision must be recorded by the appropriate governance authority before its dependent workflow is enabled. The deadlines below describe dependency gates rather than calendar commitments.

### D01 Privacy model

Decide whether choices remain permanently secret, are revealed after closing, or follow a configurable mode. Define protection against the public, peers, administrators, and collectors, and how signed reviews and recommendations interact with it.

Resolve  Before privacy implementation and any pilot vote. Related requirements: R24 R25 R31.

### D02 Approval and abstention

Define the approval denominator, the effect of abstention on quorum, and the treatment of ties.

Resolve  Before freezing voting policy. Related requirements: R12 R21 R22.

### D03 Coordination and composition

Resolve six voters versus six people and the seats covered by geographic limits.

Resolve  Before configuring the pilot committee. Related requirements: R08 R09 R10.

### D04 Veto procedure

Define the authority, start and end, calendar or business days, and final authorization. Replace DAO DAO-specific procedure with the procedure of this platform.

Resolve  Before enabling provisional approval. Related requirements: R28 R29.

### D05 Chain cutoff

Define the evidence and confirmations required for a valid vote and final tally.

Resolve  Before tally finalization changes. Related requirements: R02 R26 R27.

### D06 Eligibility and voting engine

Choose member invitations or cryptographic membership proofs. Demonstrate compatibility before assuming that a Coinholder engine provides equal weight per member.

Resolve  Before committing to a cryptographic integration. Related requirements: R01 R21 R23 R24.

### D07 Alternates

Define when replacements can occur without silently changing the electorate of an open round.

Resolve  Before replacement permissions are enabled. Related requirements: R08 R11 R12 R21.

### D08 Budget policy

USD budgets and payment-day ZEC conversion are selected under R48. Define the quote source, freshness, rounding, fee treatment, funding authority, reservation time, and pause and continuation effects. Do not hard-code ZCG or donations as universal authorities.

Resolve  Before authorizing grants or payments. Related requirements: R19 R34 R35 R36 R39.

### D09 Appeals

Define which members may support an appeal and which body decides it.

Resolve  Before enabling scope appeals. Related requirements: R15.

### D10 Content preservation

Define recoverable storage for content and attachments alongside the chain commitment. A hash and timestamp do not guarantee that the text remains available.

Resolve  Before publishing immutable proposals. Related requirements: R02 R03.

### D11 Comment participation and visibility

Define who may comment, who may read the discussion, whether publication is immediate, who moderates, how edits and removals are recorded, and whether new comments remain open after voting closes. Attribution must not automatically expose private ballot choices.

Resolve  Before enabling proposal comments. Related requirements: R06 R24 R25 R40.

Current slice  The local implementation admits leaders, eligible permanent participants and valid poll-scoped invitations; comments are immutable, moderation retains a reason, and archived discussion is read-only. This is an implementation policy, not a configurable community policy or approval of a binding pilot.

### D12 Membership policy authority

The choice between Leader-managed and Vote-governed is confirmed. Define who can select or change it, which leaders may add/remove members, and how pending membership proposals block or constrain switching. Preserve existing communities as vote-governed until an authorized, recorded change. Do not use a mode switch to bypass an in-flight decision.

Resolve  Before enabling direct membership changes. Related requirements: R08 R21 R28 R41.

### D13 Name control and account binding

Choose and pin the registry/provider, network and supported control-verification flow. Define account recovery, name transfer and rebinding. Name resolution alone is not authentication and must not grant admission or votes. Preserve legacy roster entries without matching people by nickname or destination address.

Resolve  Before enabling ZcashNames access. Related requirements: R06 R24 R41.

### D14 Paid participation operations

The receiving model and naming are confirmed under R43. The initial price is confirmed under R49: US$ 0.25 per Zcred and 20 Zcred / US$ 5 per proposal. Define the conversion source and quote expiry, confirmation policy, pricing of new revisions, recovery for wrong/late/ambiguous payments, post-credit chain changes, refund authority and receiver rotation. Define how confirmed revenue enters recorded treasury accounting without duplicate recognition.

Resolve  Before enabling real paid participation. Related requirements: R34 R36 R42 R43 R49 R50.

## Implementation and pilot acceptance

A phase is complete only when its required behavior, migration, and applicable failure cases have been demonstrated. Keep the chosen policy version and verification evidence with the delivery. Changes to policy must affect future rounds through a recorded version, while preserving already frozen rounds.

Before a pilot, verify community isolation, member permissions, proposal recovery and commitments, exact threshold calculations, delayed collection, retry safety, the veto process, report privacy, and budget concurrency. Use an approved candidate policy profile and explicit funding authority. Pilot activation is not a substitute for resolving the decision register.

## References

The requirements derive from the 18-post forum conversation identified by the user. This document preserves requirements and policy details without reproducing personal accounts or allegations. Draft rules and later corrections remain distinct.

[Post 5 Committees by expertise](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/5)

[Post 6 Initial proposal](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/6)

[Post 7 Pilot and delegated budget](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/7)

[Post 8 Draft specification](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/8)

[Post 9 Concentration and recusals](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/9)

[Post 10 Corrections to the draft](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/10)

[Post 11 Scope and referral discussion in posts 11 to 15](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/11)

[Post 17 Annual budget coverage and absence of exclusivity in posts 16 to 17](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/17)

[Post 18 Zcash privacy and immutability](https://forum.zcashcommunity.com/t/re-zcg-june-2026-election-candidate-video-thread/58035/18)

User decisions establish the small-community product direction, private repository, English documentation, proposal comments, and progression into implementation. Engineering requirements explicitly labeled as evolution or integrity address correctness gaps in the existing system.
