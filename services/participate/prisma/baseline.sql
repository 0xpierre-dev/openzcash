--
-- PostgreSQL database dump
--

\restrict afolPhoHJjInQI2ugiT4AELhRn5gtXT8x8kMtjjzkpHILkXEyktBeDUf3lApG0K

-- Dumped from database version 16.14 (Homebrew)
-- Dumped by pg_dump version 16.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: CommunityMembershipRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CommunityMembershipRole" AS ENUM (
    'OWNER',
    'MANAGER',
    'REVIEWER',
    'MODERATOR'
);


--
-- Name: CommunityMembershipStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CommunityMembershipStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


--
-- Name: CreditOperationKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CreditOperationKind" AS ENUM (
    'PREVIEW_GRANT',
    'COMMENT',
    'REACTION',
    'PURCHASE',
    'PROPOSAL_SUBMISSION',
    'ADMIN_DEMO_GRANT'
);


--
-- Name: CreditPaymentNetwork; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CreditPaymentNetwork" AS ENUM (
    'mainnet',
    'testnet',
    'regtest'
);


--
-- Name: CreditPaymentPool; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CreditPaymentPool" AS ENUM (
    'sapling',
    'orchard'
);


--
-- Name: CreditPurchaseState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CreditPurchaseState" AS ENUM (
    'PENDING',
    'CONFIRMING',
    'CREDITED',
    'EXPIRED',
    'REVIEW'
);


--
-- Name: DaoMemberStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DaoMemberStatus" AS ENUM (
    'ACTIVE',
    'REMOVED'
);


--
-- Name: DaoMembershipActionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DaoMembershipActionStatus" AS ENUM (
    'PENDING',
    'APPLIED',
    'REJECTED'
);


--
-- Name: DaoMembershipActionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DaoMembershipActionType" AS ENUM (
    'ADD_MEMBER',
    'REMOVE_MEMBER'
);


--
-- Name: DaoMembershipRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DaoMembershipRequestStatus" AS ENUM (
    'PENDING',
    'PROPOSED',
    'ADMITTED',
    'DECLINED',
    'WITHDRAWN'
);


--
-- Name: DiscussionNotificationKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DiscussionNotificationKind" AS ENUM (
    'COMMENT_LIKED',
    'COMMENT_REPLIED',
    'PROPOSAL_ARRIVED'
);


--
-- Name: ParticipationMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ParticipationMode" AS ENUM (
    'FREE',
    'CREDITS'
);


--
-- Name: PollAudience; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollAudience" AS ENUM (
    'CUSTOM',
    'DAO_MEMBERS'
);


--
-- Name: PollInviteDeliveryChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollInviteDeliveryChannel" AS ENUM (
    'EMAIL',
    'SIGNAL'
);


--
-- Name: PollInviteStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollInviteStatus" AS ENUM (
    'PENDING',
    'SENT',
    'OPENED',
    'FAILED'
);


--
-- Name: PollStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollStatus" AS ENUM (
    'DRAFT',
    'ANCHORING',
    'SCHEDULED',
    'OPEN',
    'CLOSED',
    'FINALIZED',
    'ARCHIVED'
);


--
-- Name: PollVoteModel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollVoteModel" AS ENUM (
    'SINGLE_CHOICE'
);


--
-- Name: PollVoterAccessStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PollVoterAccessStatus" AS ENUM (
    'ACTIVE',
    'USED',
    'EXPIRED',
    'REVOKED'
);


--
-- Name: PublicAuditEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PublicAuditEventType" AS ENUM (
    'POLL_CREATED',
    'VOTE_OBSERVED',
    'VOTE_CONFIRMED'
);


--
-- Name: TicketStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TicketStatus" AS ENUM (
    'ISSUED',
    'LOCKED',
    'VOTED',
    'EXPIRED',
    'REVOKED'
);


--
-- Name: TreasuryKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TreasuryKind" AS ENUM (
    'COMMUNITY',
    'SUSTAINABILITY'
);


--
-- Name: TreasuryOperationKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TreasuryOperationKind" AS ENUM (
    'FUNDING',
    'ALLOCATION'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'CREATOR',
    'USER'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


--
-- Name: VoteOptionLetter; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VoteOptionLetter" AS ENUM (
    'A',
    'B',
    'C',
    'D',
    'E'
);


--
-- Name: VoteReceiptStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VoteReceiptStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'REJECTED',
    'DUPLICATE_IGNORED'
);


--
-- Name: VoteRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VoteRequestStatus" AS ENUM (
    'ACTIVE',
    'USED',
    'EXPIRED'
);


--
-- Name: WorkspaceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkspaceKind" AS ENUM (
    'DAO',
    'COMMITTEE'
);


--
-- Name: archive_activity_batch_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_activity_batch_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Activity batches must be retained'; END IF;
  IF (to_jsonb(NEW) - 'txid') IS DISTINCT FROM (to_jsonb(OLD) - 'txid') OR OLD."txid" IS NOT NULL OR NEW."txid" IS NULL THEN
    RAISE EXCEPTION 'Only the initial transaction binding is permitted';
  END IF;
  IF (SELECT count(*) FROM "ArchiveActivityInclusion" WHERE "batchId" = NEW."id") <> NEW."leafCount" THEN
    RAISE EXCEPTION 'Incomplete activity batch';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: archive_activity_event_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_activity_event_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE prior "ArchiveActivityEvent"; archive "ProposalArchive"; payload JSONB; valid_actor BOOLEAN;
BEGIN
  SELECT * INTO archive FROM "ProposalArchive" WHERE "id" = NEW."archiveId" FOR UPDATE;
  SELECT * INTO prior FROM "ArchiveActivityEvent" WHERE "archiveId" = NEW."archiveId" ORDER BY "sequence" DESC LIMIT 1;
  payload := NEW."eventJson"::jsonb;
  IF payload->>'kind' = 'DISCUSSION_CLOSED' THEN
    valid_actor := payload->>'actor' = 'SOURCE_OBSERVER' AND payload->>'authority' = 'OFFICIAL_SOURCE'
      AND EXISTS (SELECT 1 FROM "ArchiveDiscussionClosure" c JOIN "ArchiveRevision" r ON r."id" = c."revisionId" WHERE c."archiveId" = NEW."archiveId" AND c."snapshotHash" = payload->>'snapshotHash' AND r."archiveId" = NEW."archiveId" AND r."manifestHash" = payload->>'proposalManifestHash');
  ELSE
    valid_actor := EXISTS (SELECT 1 FROM "ArchiveActivityActor" a WHERE a."id" = payload->>'actor' AND a."archiveId" = NEW."archiveId");
  END IF;
  IF NEW."sequence" <> COALESCE(prior."sequence", 0) + 1 OR payload->>'previousEventHash' IS DISTINCT FROM prior."eventHash"
    OR payload->>'id' IS DISTINCT FROM NEW."id" OR (payload->>'sequence')::integer IS DISTINCT FROM NEW."sequence"
    OR payload->>'recordId' IS DISTINCT FROM archive."recordId" OR payload->>'communityId' IS DISTINCT FROM archive."communityId"
    OR payload->>'schema' IS DISTINCT FROM 'PARTICIPATE_EVENT_V1' OR NOT COALESCE(valid_actor,false)
    OR NOT EXISTS (SELECT 1 FROM "ArchiveRevision" r WHERE r."archiveId" = NEW."archiveId" AND r."manifestHash" = payload->>'proposalManifestHash') THEN RAISE EXCEPTION 'Invalid activity event chain'; END IF;
  RETURN NEW;
END $$;


--
-- Name: archive_activity_inclusion_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_activity_inclusion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE batch "ArchiveActivityBatch"; scope TEXT;
BEGIN
  SELECT * INTO batch FROM "ArchiveActivityBatch" WHERE "id" = NEW."batchId" FOR UPDATE;
  SELECT a."communityId" INTO scope FROM "ArchiveActivityEvent" e JOIN "ProposalArchive" a ON a."id" = e."archiveId" WHERE e."id" = NEW."eventId";
  IF batch."txid" IS NOT NULL OR scope IS DISTINCT FROM batch."communityId"
    OR NEW."proof"->>'root' IS DISTINCT FROM batch."root"
    OR (NEW."proof"->>'leafCount')::integer IS DISTINCT FROM batch."leafCount"
    OR (SELECT count(*) FROM "ArchiveActivityInclusion" WHERE "batchId" = batch."id") >= batch."leafCount" THEN
    RAISE EXCEPTION 'Invalid activity batch membership';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: archive_comment_initial_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_comment_initial_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "ArchiveCommentVersion" ("id","commentId","version","body","bodyHash","requestKey","createdAt") VALUES
    ('initial:' || NEW."id", NEW."id", 1, NEW."body", encode(sha256(convert_to(NEW."body",'UTF8')),'hex'), NEW."requestKey", NEW."createdAt");
  RETURN NEW;
END $$;


--
-- Name: archive_comment_version_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_comment_version_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE comment "ArchiveComment"; prior "ArchiveCommentVersion";
BEGIN
  SELECT * INTO comment FROM "ArchiveComment" WHERE "id" = NEW."commentId" FOR UPDATE;
  IF NEW."version" = 1 THEN
    IF NEW."body" <> comment."body" OR NEW."requestKey" <> comment."requestKey" OR NEW."createdAt" <> comment."createdAt" OR NEW."previousBodyHash" IS NOT NULL THEN RAISE EXCEPTION 'Initial comment version mismatch'; END IF;
  ELSE
    SELECT * INTO prior FROM "ArchiveCommentVersion" WHERE "commentId" = NEW."commentId" AND "version" = comment."currentVersion";
    IF comment."hiddenAt" IS NOT NULL OR comment."withdrawnAt" IS NOT NULL OR NEW."version" <> comment."currentVersion" + 1 OR NEW."previousBodyHash" IS DISTINCT FROM prior."bodyHash" OR NEW."createdAt" < prior."createdAt" THEN RAISE EXCEPTION 'Invalid comment revision'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: archive_participation_identity_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_participation_identity_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reaction history must be retained'; END IF;
  IF (to_jsonb(OLD) - 'liked' - 'chargedBefore') IS DISTINCT FROM (to_jsonb(NEW) - 'liked' - 'chargedBefore')
    OR (OLD."chargedBefore" AND NOT NEW."chargedBefore") THEN
    RAISE EXCEPTION 'Reaction identity and prior charges are immutable';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: community_workspace_journal_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.community_workspace_journal_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    operation_id text;
    operation_row "TreasuryOperation"%ROWTYPE;
    entry_count bigint;
    delta_total numeric;
    credits bigint;
    debits bigint;
BEGIN
    IF TG_TABLE_NAME = 'TreasuryOperation' THEN
        operation_id := NEW."id";
    ELSE
        operation_id := NEW."operationId";
    END IF;
    SELECT * INTO STRICT operation_row FROM "TreasuryOperation" WHERE "id" = operation_id;
    SELECT count(*), COALESCE(sum("deltaZat"), 0),
        count(*) FILTER (WHERE "treasuryId" = operation_row."destinationTreasuryId" AND "deltaZat" = operation_row."amountZat"),
        count(*) FILTER (WHERE "treasuryId" = operation_row."sourceTreasuryId" AND "deltaZat" = -operation_row."amountZat")
    INTO entry_count, delta_total, credits, debits
    FROM "TreasuryLedgerEntry" WHERE "operationId" = operation_id;
    IF operation_row."kind" = 'FUNDING' THEN
        IF entry_count <> 1 OR credits <> 1 OR delta_total <> operation_row."amountZat" THEN
            RAISE EXCEPTION 'Funding journal is incomplete';
        END IF;
    ELSE
        IF entry_count <> 2 OR credits <> 1 OR debits <> 1 OR delta_total <> 0 THEN
            RAISE EXCEPTION 'Allocation journal must contain matching debit and credit';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: community_workspace_journal_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.community_workspace_journal_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'Recorded treasury history cannot be changed or deleted';
END;
$$;


--
-- Name: credit_purchase_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_purchase_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE purchase_id TEXT; purchase_row "CreditPurchase"%ROWTYPE; receipt_row "CreditPaymentReceipt"%ROWTYPE; operation_row "CreditOperation"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'CreditPurchase' THEN purchase_id := NEW."id";
  ELSE purchase_id := NEW."purchaseId"; END IF;
  IF purchase_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT purchase_row FROM "CreditPurchase" WHERE "id" = purchase_id;
  SELECT * INTO receipt_row FROM "CreditPaymentReceipt" WHERE "purchaseId" = purchase_id;
  SELECT * INTO operation_row FROM "CreditOperation" WHERE "purchaseId" = purchase_id;
  IF purchase_row."creditedAt" IS NULL THEN
    IF receipt_row."id" IS NOT NULL OR operation_row."id" IS NOT NULL THEN RAISE EXCEPTION 'Purchase receipt and credits require a completed purchase'; END IF;
  ELSE
    IF purchase_row."status" NOT IN ('CREDITED', 'REVIEW') OR receipt_row."id" IS NULL OR operation_row."id" IS NULL
      OR receipt_row."network" <> purchase_row."network" OR receipt_row."receiverAccountId" <> purchase_row."receiverAccountId"
      OR receipt_row."amountZat" <> purchase_row."amountZat" OR receipt_row."memo" <> purchase_row."memo"
      OR receipt_row."confirmations" < purchase_row."requiredConfirmations" OR receipt_row."blockTime" > purchase_row."expiresAt"
      OR receipt_row."blockHeight" < purchase_row."startHeight"
      OR operation_row."kind" <> 'PURCHASE' OR operation_row."delta" <> purchase_row."credits" THEN
      RAISE EXCEPTION 'Purchase receipt and credit journal do not match the immutable quote';
    END IF;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: credit_purchase_no_demo_mix(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_purchase_no_demo_mix() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE account_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'CreditPurchase' THEN
    account_id := NEW."creditAccountId";
    IF EXISTS (SELECT 1 FROM "CreditOperation" WHERE "accountId" = account_id AND "kind" IN ('PREVIEW_GRANT', 'ADMIN_DEMO_GRANT')) THEN
      RAISE EXCEPTION 'Demo credit accounts cannot receive real purchases';
    END IF;
  ELSIF NEW."kind" IN ('PREVIEW_GRANT', 'ADMIN_DEMO_GRANT') THEN
    IF EXISTS (SELECT 1 FROM "CreditPurchase" WHERE "creditAccountId" = NEW."accountId") THEN
      RAISE EXCEPTION 'Real purchase accounts cannot receive demo credits';
    END IF;
    IF NEW."kind" = 'ADMIN_DEMO_GRANT' AND (
      NOT EXISTS (SELECT 1 FROM "CreditOperation" WHERE "accountId" = NEW."accountId" AND "kind" = 'PREVIEW_GRANT')
      OR NOT EXISTS (SELECT 1 FROM "Community" WHERE id = NEW."communityId" AND kind = 'COMMITTEE')
    ) THEN RAISE EXCEPTION 'Demo top-ups require an existing committee demo allowance'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: credit_purchase_quote_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_purchase_quote_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Credit purchase history cannot be deleted'; END IF;
  IF ROW(OLD."creditAccountId", OLD."communityId", OLD."userId", OLD."requestKey", OLD."receiverId", OLD."receiverAccountId", OLD."network", OLD."address", OLD."amountZat", OLD."credits", OLD."requiredConfirmations", OLD."memo", OLD."startHeight", OLD."expiresAt", OLD."createdAt")
    IS DISTINCT FROM ROW(NEW."creditAccountId", NEW."communityId", NEW."userId", NEW."requestKey", NEW."receiverId", NEW."receiverAccountId", NEW."network", NEW."address", NEW."amountZat", NEW."credits", NEW."requiredConfirmations", NEW."memo", NEW."startHeight", NEW."expiresAt", NEW."createdAt") THEN
    RAISE EXCEPTION 'Credit purchase quote is immutable';
  END IF;
  IF (OLD."creditedAt" IS NOT NULL AND OLD."creditedAt" IS DISTINCT FROM NEW."creditedAt")
    OR (OLD."status" = 'CREDITED' AND NEW."status" NOT IN ('CREDITED', 'REVIEW'))
    OR (OLD."status" = 'REVIEW' AND NEW."status" <> 'REVIEW') THEN
    RAISE EXCEPTION 'A credited or reviewed purchase cannot be reset';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: immutable_funding_quote(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_funding_quote() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Funding estimate history is immutable';
END;
$$;


--
-- Name: participate_automation_job_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participate_automation_job_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Automation intents must be retained'; END IF;
  IF (NEW."id", NEW."hostId", NEW."committeeId", NEW."issueNumber", NEW."sourceUrl", NEW."revision", NEW."sourceFingerprint", NEW."manifestHash", NEW."packageJson", NEW."createdAt")
     IS DISTINCT FROM (OLD."id", OLD."hostId", OLD."committeeId", OLD."issueNumber", OLD."sourceUrl", OLD."revision", OLD."sourceFingerprint", OLD."manifestHash", OLD."packageJson", OLD."createdAt")
     THEN RAISE EXCEPTION 'Automation capture is immutable'; END IF;
  IF (OLD."txid" IS NOT NULL AND NEW."txid" IS DISTINCT FROM OLD."txid") OR
     (OLD."revisionId" IS NOT NULL AND NEW."revisionId" IS DISTINCT FROM OLD."revisionId") OR
     (OLD."anchorId" IS NOT NULL AND NEW."anchorId" IS DISTINCT FROM OLD."anchorId")
     THEN RAISE EXCEPTION 'Automation publication identity is immutable'; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: participate_automation_log_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participate_automation_log_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Automation logs are append only'; END;
$$;


--
-- Name: participate_source_checkpoint_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participate_source_checkpoint_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Source checkpoints must be retained'; END IF;
  IF (NEW."hostId", NEW."issueNumber", NEW."recordId") IS DISTINCT FROM (OLD."hostId", OLD."issueNumber", OLD."recordId")
    THEN RAISE EXCEPTION 'Source checkpoint identity is immutable'; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: participation_credit_balance_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participation_credit_balance_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  account_id TEXT;
  recorded INTEGER;
  journal BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'CreditAccount' THEN account_id := NEW."id";
  ELSE account_id := NEW."accountId"; END IF;
  SELECT "balance" INTO recorded FROM "CreditAccount" WHERE "id" = account_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM("delta"), 0) INTO journal FROM "CreditOperation" WHERE "accountId" = account_id;
  IF recorded <> journal THEN RAISE EXCEPTION 'Participation credit balance does not match its journal'; END IF;
  RETURN NULL;
END $$;


--
-- Name: participation_credit_history_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participation_credit_history_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Participation history is append-only';
END $$;


--
-- Name: participation_reaction_identity_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participation_reaction_identity_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."pollId" IS DISTINCT FROM NEW."pollId" OR OLD."commentId" IS DISTINCT FROM NEW."commentId"
    OR OLD."actorKey" IS DISTINCT FROM NEW."actorKey" OR OLD."authorUserId" IS DISTINCT FROM NEW."authorUserId"
    OR OLD."authorPollVoterAccessId" IS DISTINCT FROM NEW."authorPollVoterAccessId"
    OR (OLD."chargedBefore" AND NOT NEW."chargedBefore") THEN
    RAISE EXCEPTION 'Participation reaction identity and prior charge cannot be changed';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: proposal_abandonment_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proposal_abandonment_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ProposalArchive" a
    JOIN "ProposalSubmission" s ON s."id" = NEW."submissionId" AND s."communityId" = a."communityId"
      AND s."committeeId" = a."committeeId" AND s."recordId" = a."recordId" AND s."state" = 'PUBLISHED_DEMO'
    JOIN "ArchiveActivityEvent" e ON e."id" = NEW."eventId" AND e."archiveId" = a."id"
    JOIN "ArchiveActivityActor" actor ON actor."archiveId" = a."id" AND actor."userId" = s."authorId"
      AND actor."id" = e."eventJson"::jsonb->>'actor'
    WHERE a."id" = NEW."archiveId" AND e."sourceKey" = 'proposal-abandoned'
      AND e."eventJson"::jsonb->>'kind' = 'PROPOSAL_ABANDONED'
      AND e."eventJson"::jsonb->>'authority' = 'AUTHOR_ACCOUNT'
      AND e."eventJson"::jsonb->>'origin' = 'LIVE'
  ) THEN RAISE EXCEPTION 'Abandonment requires the published author and a matching event'; END IF;
  RETURN NEW;
END $$;


--
-- Name: proposal_committee_scope_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proposal_committee_scope_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."committeeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Community" WHERE "id" = NEW."committeeId" AND "kind" = 'COMMITTEE'
  ) THEN RAISE EXCEPTION 'Public committee records require a committee scope'; END IF;
  -- Initial assignment supports legacy hosted records; later changes need an
  -- explicit migration rather than silently switching balances or moderators.
  IF TG_OP = 'UPDATE' AND OLD."committeeId" IS NOT NULL
    AND NEW."committeeId" IS DISTINCT FROM OLD."committeeId"
    THEN RAISE EXCEPTION 'Committee scope cannot be reassigned'; END IF;
  RETURN NEW;
END $$;


--
-- Name: proposal_funding_draft_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proposal_funding_draft_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD."requestedAmountUsdCents" IS DISTINCT FROM NEW."requestedAmountUsdCents"
      OR OLD."requestedAmountZat" IS DISTINCT FROM NEW."requestedAmountZat"
      OR OLD."treasuryId" IS DISTINCT FROM NEW."treasuryId")
      AND (OLD."status" <> 'DRAFT' OR OLD."anchorTxid" IS NOT NULL) THEN
    RAISE EXCEPTION 'Published proposal funding cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: proposal_submission_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proposal_submission_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."state" <> 'DRAFT' THEN RAISE EXCEPTION 'Published submissions are immutable'; END IF;
    INSERT INTO "ProposalDraftDeletion" ("id", "communityId", "committeeId", "authorId", "version", "createdAt")
      VALUES (OLD."id", OLD."communityId", OLD."committeeId", OLD."authorId", OLD."version", OLD."createdAt");
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM "ProposalDraftDeletion" WHERE "id" = NEW."id")
    THEN RAISE EXCEPTION 'Deleted drafts cannot be recreated'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD."state" <> 'DRAFT' OR OLD."communityId" <> NEW."communityId"
    OR OLD."committeeId" <> NEW."committeeId" OR OLD."authorId" <> NEW."authorId" OR OLD."id" <> NEW."id")
    THEN RAISE EXCEPTION 'Submission ownership and published contents are immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Community" WHERE "id" = NEW."committeeId" AND "kind" = 'COMMITTEE')
    THEN RAISE EXCEPTION 'A submission requires a committee scope'; END IF;
  RETURN NEW;
END $$;


--
-- Name: proposal_topics_draft_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proposal_topics_draft_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."proposalTags" IS DISTINCT FROM NEW."proposalTags" AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published proposal topics cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: protect_committee_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_committee_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Committee history is append-only'; END;
$$;


--
-- Name: protect_poll_collection_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_poll_collection_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Collection history cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'RUNNING' THEN RAISE EXCEPTION 'Collection checks must start as RUNNING'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'RUNNING' OR NEW."status" = 'RUNNING' THEN
    RAISE EXCEPTION 'Completed collection checks are immutable';
  END IF;
  IF (NEW."id", NEW."pollId", NEW."actorId", NEW."requestKey", NEW."scopeHash", NEW."startedAt", NEW."leaseExpiresAt")
    IS DISTINCT FROM (OLD."id", OLD."pollId", OLD."actorId", OLD."requestKey", OLD."scopeHash", OLD."startedAt", OLD."leaseExpiresAt") THEN
    RAISE EXCEPTION 'Collection request identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: protect_signed_decision_record(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_signed_decision_record() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Signed decision records are append-only'; END;
$$;


--
-- Name: restrict_committee_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restrict_committee_roles() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."role" IN ('REVIEWER', 'MODERATOR') AND NOT EXISTS (SELECT 1 FROM "Community" WHERE "id" = NEW."communityId" AND "kind" = 'COMMITTEE') THEN
    RAISE EXCEPTION 'Reviewer and moderator roles require a committee';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: valid_proposal_topics(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_proposal_topics(tags text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT cardinality(tags) <= 3
    AND (cardinality(tags) = 0 OR (array_ndims(tags) = 1 AND array_lower(tags, 1) = 1))
    AND array_position(tags, NULL) IS NULL
    AND tags <@ ARRAY['security', 'infrastructure', 'community', 'education', 'applications',
      'integration', 'wallets', 'research', 'media', 'protocol', 'operations', 'events', 'retroactive']::TEXT[]
    AND cardinality(tags) = (SELECT count(DISTINCT topic) FROM unnest(tags) AS topic);
$$;


--
-- Name: workspace_kind_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_kind_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN RAISE EXCEPTION 'Workspace kind is immutable'; END IF;
  RETURN NEW;
END $$;


--
-- Name: zvoice_archive_anchor_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zvoice_archive_anchor_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Anchor intents must be retained'; END IF;
  IF (NEW."id", NEW."revisionId", NEW."network", NEW."memo", NEW."receiver", NEW."createdAt", NEW."commitment") IS DISTINCT FROM (OLD."id", OLD."revisionId", OLD."network", OLD."memo", OLD."receiver", OLD."createdAt", OLD."commitment") THEN RAISE EXCEPTION 'Anchor identity is immutable'; END IF;
  IF NOT ((OLD."state" = 'PREPARED' AND NEW."state" = 'SUBMITTING') OR (OLD."state" = 'SUBMITTING' AND NEW."state" IN ('SUBMITTED','UNKNOWN')) OR (OLD."state" = 'SUBMITTED' AND NEW."state" IN ('BROADCAST','UNBROADCAST','FAILED','UNKNOWN'))) THEN RAISE EXCEPTION 'Invalid anchor transition'; END IF;
  IF OLD."operationId" IS NOT NULL AND NEW."operationId" IS DISTINCT FROM OLD."operationId" THEN RAISE EXCEPTION 'Operation identity is immutable'; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: zvoice_archive_comment_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zvoice_archive_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Comments must be retained'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."currentVersion" <> 1 OR NEW."withdrawnAt" IS NOT NULL OR NEW."hiddenAt" IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial comment'; END IF;
    IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArchiveComment" p WHERE p."id" = NEW."parentId" AND p."archiveId" = NEW."archiveId" AND p."hiddenAt" IS NULL AND p."withdrawnAt" IS NULL) THEN RAISE EXCEPTION 'Invalid reply'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."archiveId", NEW."authorId", NEW."authorLabel", NEW."body", NEW."parentId", NEW."requestKey", NEW."createdAt") IS DISTINCT FROM (OLD."id", OLD."archiveId", OLD."authorId", OLD."authorLabel", OLD."body", OLD."parentId", OLD."requestKey", OLD."createdAt") THEN RAISE EXCEPTION 'Comment identity is immutable'; END IF;
  IF (NEW."hiddenAt", NEW."hiddenById", NEW."hiddenByLabel", NEW."hideReason") IS DISTINCT FROM (OLD."hiddenAt", OLD."hiddenById", OLD."hiddenByLabel", OLD."hideReason") THEN
    IF OLD."hiddenAt" IS NOT NULL OR NEW."hiddenAt" IS NULL OR (NEW."currentVersion",NEW."withdrawnAt",NEW."withdrawalKey") IS DISTINCT FROM (OLD."currentVersion",OLD."withdrawnAt",OLD."withdrawalKey") THEN RAISE EXCEPTION 'Invalid moderation'; END IF;
  ELSIF NEW."currentVersion" <> OLD."currentVersion" THEN
    IF OLD."hiddenAt" IS NOT NULL OR OLD."withdrawnAt" IS NOT NULL OR NEW."currentVersion" <> OLD."currentVersion" + 1 OR NEW."withdrawnAt" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "ArchiveCommentVersion" v WHERE v."commentId" = NEW."id" AND v."version" = NEW."currentVersion") THEN RAISE EXCEPTION 'Invalid revision pointer'; END IF;
  ELSIF (NEW."withdrawnAt",NEW."withdrawalKey") IS DISTINCT FROM (OLD."withdrawnAt",OLD."withdrawalKey") THEN
    IF OLD."hiddenAt" IS NOT NULL OR OLD."withdrawnAt" IS NOT NULL OR NEW."withdrawnAt" IS NULL THEN RAISE EXCEPTION 'Invalid withdrawal'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: zvoice_archive_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.zvoice_archive_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Archive evidence is immutable'; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ActivityAutomationJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityAutomationJob" (
    "batchId" text NOT NULL,
    state text DEFAULT 'PREPARED'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastErrorCode" text,
    "feeZat" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ActivityAutomationJob_feeZat_check" CHECK ((("feeZat" >= 1) AND ("feeZat" <= 50000))),
    CONSTRAINT "ActivityAutomationJob_state_check" CHECK ((state = ANY (ARRAY['PREPARED'::text, 'DISPATCHED'::text, 'CONFIRMING'::text, 'VERIFIED'::text, 'NEEDS_REVIEW'::text])))
);


--
-- Name: ArchiveActivityActor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveActivityActor" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: ArchiveActivityBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveActivityBatch" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    network public."CreditPaymentNetwork" NOT NULL,
    root text NOT NULL,
    "leafCount" integer NOT NULL,
    memo text NOT NULL,
    receiver text NOT NULL,
    txid text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    pool text DEFAULT 'sapling'::text NOT NULL,
    CONSTRAINT "ArchiveActivityBatch_check" CHECK ((memo = ((((('PARTICIPATE|ACTIVITY|v1|'::text || (network)::text) || '|count:'::text) || ("leafCount")::text) || '|sha256:'::text) || root))),
    CONSTRAINT "ArchiveActivityBatch_leafCount_check" CHECK ((("leafCount" >= 1) AND ("leafCount" <= 10000))),
    CONSTRAINT "ArchiveActivityBatch_network_check" CHECK ((network = ANY (ARRAY['testnet'::public."CreditPaymentNetwork", 'mainnet'::public."CreditPaymentNetwork"]))),
    CONSTRAINT "ArchiveActivityBatch_pool_check" CHECK ((pool = ANY (ARRAY['sapling'::text, 'ironwood'::text]))),
    CONSTRAINT "ArchiveActivityBatch_root_check" CHECK ((root ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT "ArchiveActivityBatch_txid_check" CHECK ((txid ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: ArchiveActivityCheck; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveActivityCheck" (
    id text NOT NULL,
    "batchId" text NOT NULL,
    status text NOT NULL,
    evidence jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveActivityCheck_status_check" CHECK ((status = ANY (ARRAY['VERIFIED'::text, 'CONFIRMING'::text, 'UNVERIFIED'::text])))
);


--
-- Name: ArchiveActivityEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveActivityEvent" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    sequence integer NOT NULL,
    "sourceKey" text NOT NULL,
    "eventHash" text NOT NULL,
    "eventJson" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveActivityEvent_check" CHECK ((encode(sha256(convert_to("eventJson", 'UTF8'::name)), 'hex'::text) = "eventHash")),
    CONSTRAINT "ArchiveActivityEvent_eventHash_check" CHECK (("eventHash" ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT "ArchiveActivityEvent_eventJson_check" CHECK ((octet_length("eventJson") <= 16000)),
    CONSTRAINT "ArchiveActivityEvent_sequence_check" CHECK ((sequence > 0))
);


--
-- Name: ArchiveActivityInclusion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveActivityInclusion" (
    "eventId" text NOT NULL,
    "batchId" text NOT NULL,
    proof jsonb NOT NULL
);


--
-- Name: ArchiveAnchor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveAnchor" (
    id text NOT NULL,
    "revisionId" text NOT NULL,
    network public."CreditPaymentNetwork" NOT NULL,
    memo text NOT NULL,
    state text DEFAULT 'PREPARED'::text NOT NULL,
    "operationId" text,
    txids text[] DEFAULT ARRAY[]::text[],
    receiver text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    commitment jsonb,
    CONSTRAINT "ArchiveAnchor_valid" CHECK (((network = ANY (ARRAY['testnet'::public."CreditPaymentNetwork", 'mainnet'::public."CreditPaymentNetwork"])) AND (octet_length(memo) <= 512) AND (state = ANY (ARRAY['PREPARED'::text, 'SUBMITTING'::text, 'SUBMITTED'::text, 'UNKNOWN'::text, 'FAILED'::text, 'BROADCAST'::text, 'UNBROADCAST'::text]))))
);


--
-- Name: ArchiveAnchorCheck; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveAnchorCheck" (
    id text NOT NULL,
    "anchorId" text NOT NULL,
    status text NOT NULL,
    evidence jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveAnchorCheck_valid" CHECK ((status = ANY (ARRAY['VERIFIED'::text, 'CONFIRMING'::text, 'UNVERIFIED'::text])))
);


--
-- Name: ArchiveComment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveComment" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    "authorId" text NOT NULL,
    "authorLabel" text NOT NULL,
    body text NOT NULL,
    "parentId" text,
    "requestKey" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "hiddenAt" timestamp(3) without time zone,
    "hiddenById" text,
    "hiddenByLabel" text,
    "hideReason" text,
    "currentVersion" integer DEFAULT 1 NOT NULL,
    "withdrawnAt" timestamp(3) without time zone,
    "withdrawalKey" text,
    CONSTRAINT "ArchiveComment_currentVersion_check" CHECK ((("currentVersion" >= 1) AND ("currentVersion" <= 50))),
    CONSTRAINT "ArchiveComment_valid" CHECK ((((length(body) >= 1) AND (length(body) <= 4000)) AND (("parentId" IS NULL) OR ("parentId" <> id)) AND ((("hiddenAt" IS NULL) AND ("hiddenById" IS NULL) AND ("hiddenByLabel" IS NULL) AND ("hideReason" IS NULL)) OR (("hiddenAt" IS NOT NULL) AND ("hiddenById" IS NOT NULL) AND ("hiddenByLabel" IS NOT NULL) AND ((length("hideReason") >= 1) AND (length("hideReason") <= 500)))))),
    CONSTRAINT "ArchiveComment_withdrawal_pair" CHECK ((("withdrawnAt" IS NULL) = ("withdrawalKey" IS NULL)))
);


--
-- Name: ArchiveCommentVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveCommentVersion" (
    id text NOT NULL,
    "commentId" text NOT NULL,
    version integer NOT NULL,
    body text NOT NULL,
    "bodyHash" text NOT NULL,
    "previousBodyHash" text,
    "requestKey" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveCommentVersion_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 4000))),
    CONSTRAINT "ArchiveCommentVersion_check" CHECK (("bodyHash" = encode(sha256(convert_to(body, 'UTF8'::name)), 'hex'::text))),
    CONSTRAINT "ArchiveCommentVersion_version_check" CHECK (((version >= 1) AND (version <= 50)))
);


--
-- Name: ArchiveDiscussionClosure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveDiscussionClosure" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    "revisionId" text NOT NULL,
    "snapshotHash" text NOT NULL,
    "snapshotJson" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveDiscussionClosure_check" CHECK (("snapshotHash" = encode(sha256(convert_to("snapshotJson", 'UTF8'::name)), 'hex'::text))),
    CONSTRAINT "ArchiveDiscussionClosure_snapshotJson_check" CHECK ((octet_length("snapshotJson") <= 8000000))
);


--
-- Name: ArchiveProposalLike; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveProposalLike" (
    "archiveId" text NOT NULL,
    "userId" text NOT NULL,
    liked boolean NOT NULL,
    "chargedBefore" boolean DEFAULT false NOT NULL
);


--
-- Name: ArchiveProposalLikeRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveProposalLikeRequest" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    "userId" text NOT NULL,
    "requestKey" text NOT NULL,
    liked boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveProposalLikeRequest_requestKey_check" CHECK (((length("requestKey") >= 1) AND (length("requestKey") <= 128)))
);


--
-- Name: ArchiveReaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveReaction" (
    "commentId" text NOT NULL,
    "userId" text NOT NULL,
    liked boolean NOT NULL,
    "chargedBefore" boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: ArchiveReactionRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveReactionRequest" (
    id text NOT NULL,
    "commentId" text NOT NULL,
    "userId" text NOT NULL,
    "requestKey" text NOT NULL,
    liked boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: ArchiveRevision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArchiveRevision" (
    id text NOT NULL,
    "archiveId" text NOT NULL,
    revision integer NOT NULL,
    "manifestHash" text NOT NULL,
    "packageJson" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ArchiveRevision_valid" CHECK (((revision > 0) AND ("manifestHash" ~ '^[a-f0-9]{64}$'::text) AND (octet_length("packageJson") <= 8388608)))
);


--
-- Name: CommitteeEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommitteeEvent" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    sequence integer NOT NULL,
    "actorId" text NOT NULL,
    action text NOT NULL,
    details jsonb NOT NULL,
    "previousHash" text,
    hash text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: CommitteeInvitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommitteeInvitation" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    email text NOT NULL,
    role public."CommunityMembershipRole" NOT NULL,
    "invitedById" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "acceptedById" text,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommitteeInvitation_role_check" CHECK ((role <> 'OWNER'::public."CommunityMembershipRole"))
);


--
-- Name: CommitteePolicy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommitteePolicy" (
    "communityId" text NOT NULL,
    quorum integer NOT NULL,
    "approvalPercent" integer NOT NULL,
    "durationHours" integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "CommitteePolicy_approvalPercent_check" CHECK ((("approvalPercent" >= 1) AND ("approvalPercent" <= 100))),
    CONSTRAINT "CommitteePolicy_durationHours_check" CHECK ((("durationHours" >= 1) AND ("durationHours" <= 720))),
    CONSTRAINT "CommitteePolicy_quorum_check" CHECK (((quorum >= 1) AND (quorum <= 200)))
);


--
-- Name: Community; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Community" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "commentCost" integer DEFAULT 1 NOT NULL,
    "participationMode" public."ParticipationMode" DEFAULT 'FREE'::public."ParticipationMode" NOT NULL,
    "participationPolicyVersion" integer DEFAULT 1 NOT NULL,
    "reactionCost" integer DEFAULT 1 NOT NULL,
    kind public."WorkspaceKind" DEFAULT 'DAO'::public."WorkspaceKind" NOT NULL,
    CONSTRAINT "Community_participation_policy_check" CHECK (((("commentCost" >= 1) AND ("commentCost" <= 100)) AND (("reactionCost" >= 1) AND ("reactionCost" <= 100)) AND ("participationPolicyVersion" > 0)))
);


--
-- Name: CommunityMembership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunityMembership" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "userId" text NOT NULL,
    role public."CommunityMembershipRole" NOT NULL,
    status public."CommunityMembershipStatus" DEFAULT 'ACTIVE'::public."CommunityMembershipStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "publicName" text,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: CommunityTreasury; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunityTreasury" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    kind public."TreasuryKind" NOT NULL,
    currency text DEFAULT 'ZEC'::text NOT NULL,
    "availableZat" bigint DEFAULT 0 NOT NULL,
    "reservedZat" bigint DEFAULT 0 NOT NULL,
    "committedZat" bigint DEFAULT 0 NOT NULL,
    "paidZat" bigint DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "CommunityTreasury_recorded_amounts_check" CHECK (((currency = 'ZEC'::text) AND (("availableZat" >= 0) AND ("availableZat" <= '2100000000000000'::bigint)) AND (("reservedZat" >= 0) AND ("reservedZat" <= '2100000000000000'::bigint)) AND (("committedZat" >= 0) AND ("committedZat" <= '2100000000000000'::bigint)) AND (("paidZat" >= 0) AND ("paidZat" <= '2100000000000000'::bigint))))
);


--
-- Name: CreditAccount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CreditAccount" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "userId" text NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "paymentReview" boolean DEFAULT false NOT NULL,
    CONSTRAINT "CreditAccount_balance_check" CHECK (((balance >= 0) AND (balance <= 1000000000)))
);


--
-- Name: CreditOperation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CreditOperation" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "communityId" text NOT NULL,
    "userId" text NOT NULL,
    kind public."CreditOperationKind" NOT NULL,
    delta integer NOT NULL,
    "requestKey" text NOT NULL,
    "payloadHash" text NOT NULL,
    "targetId" text,
    "policyVersion" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "purchaseId" text,
    CONSTRAINT "CreditOperation_shape_check" CHECK ((((char_length("requestKey") >= 1) AND (char_length("requestKey") <= 128)) AND ("payloadHash" ~ '^[a-f0-9]{64}$'::text) AND ("policyVersion" > 0) AND (((kind = 'PREVIEW_GRANT'::public."CreditOperationKind") AND (delta = 25) AND ("targetId" IS NULL) AND ("requestKey" = 'preview-grant:v1'::text) AND ("purchaseId" IS NULL)) OR ((kind = 'ADMIN_DEMO_GRANT'::public."CreditOperationKind") AND ((delta >= 1) AND (delta <= 1000)) AND ("purchaseId" IS NULL) AND ("requestKey" ~ '^demo-topup:[A-Za-z0-9][A-Za-z0-9:_-]{0,110}$'::text) AND ("targetId" IS NOT NULL) AND ((char_length(TRIM(BOTH FROM "targetId")) >= 8) AND (char_length(TRIM(BOTH FROM "targetId")) <= 128))) OR ((kind = ANY (ARRAY['COMMENT'::public."CreditOperationKind", 'REACTION'::public."CreditOperationKind"])) AND ((delta >= '-100'::integer) AND (delta <= '-1'::integer)) AND ("targetId" IS NOT NULL) AND ((char_length("targetId") >= 1) AND (char_length("targetId") <= 128)) AND ("purchaseId" IS NULL)) OR ((kind = 'PROPOSAL_SUBMISSION'::public."CreditOperationKind") AND (delta = '-20'::integer) AND ("targetId" IS NOT NULL) AND ((char_length("targetId") >= 1) AND (char_length("targetId") <= 128)) AND ("purchaseId" IS NULL) AND ("policyVersion" = 1)) OR ((kind = 'PURCHASE'::public."CreditOperationKind") AND ((delta >= 1) AND (delta <= 1000000)) AND ("purchaseId" IS NOT NULL) AND ("targetId" = "purchaseId")))))
);


--
-- Name: CreditPaymentReceipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CreditPaymentReceipt" (
    id text NOT NULL,
    "purchaseId" text NOT NULL,
    network public."CreditPaymentNetwork" NOT NULL,
    txid text NOT NULL,
    pool public."CreditPaymentPool" NOT NULL,
    "outputIndex" integer NOT NULL,
    "receiverAccountId" text NOT NULL,
    "amountZat" bigint NOT NULL,
    memo text NOT NULL,
    "blockHeight" integer NOT NULL,
    "blockHash" text NOT NULL,
    "blockTime" timestamp(3) without time zone NOT NULL,
    confirmations integer NOT NULL,
    "tipHeight" integer NOT NULL,
    "tipHash" text NOT NULL,
    "scannedHeight" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CreditPaymentReceipt_evidence_check" CHECK (((txid ~ '^[a-f0-9]{64}$'::text) AND ("blockHash" ~ '^[a-f0-9]{64}$'::text) AND ("tipHash" ~ '^[a-f0-9]{64}$'::text) AND (("amountZat" >= 1) AND ("amountZat" <= '2100000000000000'::bigint)) AND ("outputIndex" >= 0) AND ("blockHeight" >= 0) AND (confirmations > 0) AND ("tipHeight" >= "blockHeight") AND ("scannedHeight" >= "tipHeight") AND (confirmations = (("tipHeight" - "blockHeight") + 1))))
);


--
-- Name: CreditPurchase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CreditPurchase" (
    id text NOT NULL,
    "creditAccountId" text NOT NULL,
    "communityId" text NOT NULL,
    "userId" text NOT NULL,
    "requestKey" text NOT NULL,
    "receiverId" text NOT NULL,
    "receiverAccountId" text NOT NULL,
    network public."CreditPaymentNetwork" NOT NULL,
    address text NOT NULL,
    "amountZat" bigint NOT NULL,
    credits integer NOT NULL,
    "requiredConfirmations" integer NOT NULL,
    memo text NOT NULL,
    "startHeight" integer NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    status public."CreditPurchaseState" DEFAULT 'PENDING'::public."CreditPurchaseState" NOT NULL,
    txid text,
    confirmations integer DEFAULT 0 NOT NULL,
    "blockHeight" integer,
    "blockHash" text,
    "blockTime" timestamp(3) without time zone,
    "lastCheckedAt" timestamp(3) without time zone,
    "checkLeaseKey" text,
    "checkLeaseUntil" timestamp(3) without time zone,
    "creditedAt" timestamp(3) without time zone,
    "reviewReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "CreditPurchase_quote_check" CHECK (((("amountZat" >= 1) AND ("amountZat" <= '2100000000000000'::bigint)) AND ((credits >= 1) AND (credits <= 1000000)) AND (("requiredConfirmations" >= 1) AND ("requiredConfirmations" <= 1000)) AND ((network <> 'mainnet'::public."CreditPaymentNetwork") OR ("requiredConfirmations" >= 6)) AND ("startHeight" >= 0) AND (confirmations >= 0) AND ("expiresAt" > "createdAt") AND ((char_length("requestKey") >= 16) AND (char_length("requestKey") <= 128)) AND ("requestKey" ~ '^[a-zA-Z0-9:_-]+$'::text) AND ((char_length(memo) >= 16) AND (char_length(memo) <= 512)) AND ((char_length(address) >= 40) AND (char_length(address) <= 512)) AND ((txid IS NULL) OR (txid ~ '^[a-f0-9]{64}$'::text)) AND ((("checkLeaseKey" IS NULL) AND ("checkLeaseUntil" IS NULL)) OR (("checkLeaseKey" IS NOT NULL) AND ("checkLeaseUntil" IS NOT NULL))) AND ((status <> 'CREDITED'::public."CreditPurchaseState") OR ("creditedAt" IS NOT NULL))))
);


--
-- Name: DaoMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DaoMember" (
    id text NOT NULL,
    nick text NOT NULL,
    "signalUsername" text,
    status public."DaoMemberStatus" DEFAULT 'ACTIVE'::public."DaoMemberStatus" NOT NULL,
    "addedByPollId" text,
    "removedByPollId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "communityId" text,
    "userId" text
);


--
-- Name: DaoMembershipAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DaoMembershipAction" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    type public."DaoMembershipActionType" NOT NULL,
    status public."DaoMembershipActionStatus" DEFAULT 'PENDING'::public."DaoMembershipActionStatus" NOT NULL,
    nick text NOT NULL,
    "signalUsername" text,
    "targetMemberId" text,
    "appliedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text,
    "requestId" text
);


--
-- Name: DaoMembershipRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DaoMembershipRequest" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "userId" text NOT NULL,
    status public."DaoMembershipRequestStatus" DEFAULT 'PENDING'::public."DaoMembershipRequestStatus" NOT NULL,
    "reviewedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text) NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: DiscussionNotification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DiscussionNotification" (
    id text NOT NULL,
    kind public."DiscussionNotificationKind" NOT NULL,
    "recipientId" text NOT NULL,
    "actorId" text,
    "commentId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readAt" timestamp(3) without time zone,
    "withdrawnAt" timestamp(3) without time zone,
    "archiveId" text,
    CONSTRAINT "DiscussionNotification_no_self" CHECK (("recipientId" <> "actorId")),
    CONSTRAINT "DiscussionNotification_target" CHECK ((((kind = 'PROPOSAL_ARRIVED'::public."DiscussionNotificationKind") AND ("archiveId" IS NOT NULL) AND ("actorId" IS NULL) AND ("commentId" IS NULL)) OR ((kind = ANY (ARRAY['COMMENT_LIKED'::public."DiscussionNotificationKind", 'COMMENT_REPLIED'::public."DiscussionNotificationKind"])) AND ("archiveId" IS NULL) AND ("actorId" IS NOT NULL) AND ("commentId" IS NOT NULL))))
);


--
-- Name: EmailAuthChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailAuthChallenge" (
    id text NOT NULL,
    email text NOT NULL,
    purpose text NOT NULL,
    "userId" text,
    binding text NOT NULL,
    origin text NOT NULL,
    "codeHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "deliveredAt" timestamp(3) without time zone,
    "consumedAt" timestamp(3) without time zone,
    attempts integer DEFAULT 0 NOT NULL
);


--
-- Name: EmailAuthThrottle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailAuthThrottle" (
    id text NOT NULL,
    attempts integer NOT NULL,
    "resetsAt" timestamp(3) without time zone NOT NULL,
    "lastSentAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: FundingQuoteThrottle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FundingQuoteThrottle" (
    "userId" text NOT NULL,
    attempts integer NOT NULL,
    "resetsAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "FundingQuoteThrottle_attempts_check" CHECK (((attempts >= 1) AND (attempts <= 6)))
);


--
-- Name: ParticipateAutomationJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ParticipateAutomationJob" (
    id text NOT NULL,
    "hostId" text NOT NULL,
    "committeeId" text NOT NULL,
    "issueNumber" integer NOT NULL,
    "sourceUrl" text NOT NULL,
    "manifestHash" text NOT NULL,
    "packageJson" text NOT NULL,
    "revisionId" text,
    "anchorId" text,
    state text DEFAULT 'CAPTURED'::text NOT NULL,
    txid text,
    "feeZat" integer,
    attempts integer DEFAULT 0 NOT NULL,
    "lastErrorCode" text,
    "nextAttemptAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    "sourceFingerprint" text,
    CONSTRAINT "ParticipateAutomationJob_feeZat_check" CHECK ((("feeZat" > 0) AND ("feeZat" <= 50000))),
    CONSTRAINT "ParticipateAutomationJob_issueNumber_check" CHECK (("issueNumber" > 0)),
    CONSTRAINT "ParticipateAutomationJob_manifestHash_check" CHECK (("manifestHash" ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT "ParticipateAutomationJob_state_check" CHECK ((state = ANY (ARRAY['CAPTURED'::text, 'PREPARED'::text, 'DISPATCHED'::text, 'CONFIRMING'::text, 'VERIFIED'::text, 'NEEDS_REVIEW'::text]))),
    CONSTRAINT "ParticipateAutomationJob_txid_check" CHECK ((txid ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT participate_source_fingerprint_valid CHECK ((("sourceFingerprint" IS NULL) OR ("sourceFingerprint" ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT participate_source_revision_valid CHECK (((revision >= 1) AND (revision <= 10000)))
);


--
-- Name: ParticipateAutomationLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ParticipateAutomationLog" (
    id text NOT NULL,
    "hostId" text NOT NULL,
    "jobId" text,
    level text NOT NULL,
    event text NOT NULL,
    code text,
    details jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ParticipateAutomationLog_level_check" CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text])))
);


--
-- Name: ParticipateAutomationState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ParticipateAutomationState" (
    "hostId" text NOT NULL,
    "committeeId" text NOT NULL,
    "policyHash" text NOT NULL,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "cursorAt" timestamp(3) without time zone NOT NULL,
    "nextPollAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastRunAt" timestamp(3) without time zone,
    "lastSuccessAt" timestamp(3) without time zone,
    "lastErrorCode" text,
    failures integer DEFAULT 0 NOT NULL
);


--
-- Name: ParticipateSourceCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ParticipateSourceCheckpoint" (
    "hostId" text NOT NULL,
    "issueNumber" integer NOT NULL,
    "recordId" text NOT NULL,
    "sourceUpdatedAt" timestamp(3) without time zone NOT NULL,
    "checkedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "ParticipateSourceCheckpoint_issueNumber_check" CHECK (("issueNumber" > 0))
);


--
-- Name: Passkey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Passkey" (
    id text NOT NULL,
    "credentialId" text NOT NULL,
    "userId" text NOT NULL,
    "userHandle" text NOT NULL,
    "rpId" text NOT NULL,
    "publicKey" bytea NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" boolean NOT NULL,
    label text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone
);


--
-- Name: PasskeyChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasskeyChallenge" (
    id text NOT NULL,
    challenge text NOT NULL,
    purpose text NOT NULL,
    origin text NOT NULL,
    "rpId" text NOT NULL,
    "userId" text,
    "userHandle" text,
    "passwordVersion" text,
    label text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PasskeyThrottle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasskeyThrottle" (
    id text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "resetsAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Poll; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Poll" (
    id text NOT NULL,
    question text NOT NULL,
    "optionALabel" text,
    "optionBLabel" text,
    "optionCLabel" text,
    "optionDLabel" text,
    "optionELabel" text,
    status public."PollStatus" DEFAULT 'DRAFT'::public."PollStatus" NOT NULL,
    "voteModel" public."PollVoteModel" DEFAULT 'SINGLE_CHOICE'::public."PollVoteModel" NOT NULL,
    "quorumPercent" integer DEFAULT 40 NOT NULL,
    "passingThresholdPercent" integer DEFAULT 67 NOT NULL,
    "anchorTxid" text,
    "anchorHeight" integer,
    audience public."PollAudience" DEFAULT 'CUSTOM'::public."PollAudience" NOT NULL,
    "questionHash" text NOT NULL,
    "feeZat" bigint NOT NULL,
    "opensAt" timestamp(3) without time zone NOT NULL,
    "closesAt" timestamp(3) without time zone NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "communityId" text,
    "contentHashVersion" text,
    "proposalBody" text,
    "requestedAmountZat" bigint,
    "treasuryId" text,
    "proposalTags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "requestedAmountUsdCents" bigint,
    CONSTRAINT "Poll_content_hash_version_check" CHECK ((("contentHashVersion" IS NULL) OR ("contentHashVersion" = ANY (ARRAY['PROPOSAL_CONTENT_V1'::text, 'PROPOSAL_CONTENT_V2'::text, 'PROPOSAL_CONTENT_V3'::text, 'MEMBERSHIP_ACCOUNT_V1'::text])))),
    CONSTRAINT "Poll_funding_request_check" CHECK (((("treasuryId" IS NULL) AND ("requestedAmountZat" IS NULL) AND ("requestedAmountUsdCents" IS NULL)) OR (("treasuryId" IS NOT NULL) AND ("communityId" IS NOT NULL) AND ((("requestedAmountUsdCents" IS NULL) AND ("requestedAmountZat" IS NOT NULL) AND (("requestedAmountZat" >= 1) AND ("requestedAmountZat" <= '2100000000000000'::bigint))) OR (("requestedAmountZat" IS NULL) AND ("requestedAmountUsdCents" IS NOT NULL) AND ("requestedAmountUsdCents" > 0) AND COALESCE(("contentHashVersion" = 'PROPOSAL_CONTENT_V3'::text), false) AND ("proposalBody" IS NOT NULL) AND (length(btrim("proposalBody")) > 0)))))),
    CONSTRAINT "Poll_membership_shape_check" CHECK ((("contentHashVersion" IS DISTINCT FROM 'MEMBERSHIP_ACCOUNT_V1'::text) OR (("communityId" IS NOT NULL) AND (audience = 'DAO_MEMBERS'::public."PollAudience") AND ("voteModel" = 'SINGLE_CHOICE'::public."PollVoteModel") AND ("proposalBody" IS NULL) AND (cardinality("proposalTags") = 0) AND ("treasuryId" IS NULL) AND ("requestedAmountZat" IS NULL) AND ("requestedAmountUsdCents" IS NULL) AND ("optionDLabel" IS NULL) AND ("optionELabel" IS NULL)))),
    CONSTRAINT "Poll_proposal_tags_check" CHECK (public.valid_proposal_topics("proposalTags")),
    CONSTRAINT "Poll_tagged_content_version_check" CHECK (((cardinality("proposalTags") = 0) OR (COALESCE(("contentHashVersion" = ANY (ARRAY['PROPOSAL_CONTENT_V2'::text, 'PROPOSAL_CONTENT_V3'::text])), false) AND ("communityId" IS NOT NULL) AND ("proposalBody" IS NOT NULL) AND (length(btrim("proposalBody")) > 0))))
);


--
-- Name: PollCollectionCheck; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollCollectionCheck" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "actorId" text NOT NULL,
    "requestKey" text NOT NULL,
    "scopeHash" text NOT NULL,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    reason text,
    "startedAt" timestamp(3) without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text) NOT NULL,
    "leaseExpiresAt" timestamp(3) without time zone NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "sourceVersion" text,
    "sourceFingerprint" text,
    network text,
    "tipHeight" integer,
    "scannedHeight" integer,
    "transactionCount" integer,
    "outputCount" integer,
    "evidenceHash" text,
    evidence jsonb,
    CONSTRAINT "PollCollectionCheck_network_check" CHECK ((network = ANY (ARRAY['mainnet'::text, 'testnet'::text, 'regtest'::text]))),
    CONSTRAINT "PollCollectionCheck_scopeHash_check" CHECK (("scopeHash" ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT "PollCollectionCheck_state" CHECK ((((status = 'RUNNING'::text) AND ("finishedAt" IS NULL) AND (reason IS NULL) AND (evidence IS NULL)) OR ((status = 'BLOCKED'::text) AND ("finishedAt" IS NOT NULL) AND (reason IS NOT NULL) AND (evidence IS NULL)) OR ((status = 'OBSERVED'::text) AND ("finishedAt" IS NOT NULL) AND (reason IS NULL) AND (network IS NOT NULL) AND ("sourceVersion" IS NOT NULL) AND ("sourceFingerprint" IS NOT NULL) AND ("sourceFingerprint" ~ '^[a-f0-9]{64}$'::text) AND ("tipHeight" IS NOT NULL) AND ("scannedHeight" IS NOT NULL) AND ("transactionCount" IS NOT NULL) AND ("outputCount" IS NOT NULL) AND ("tipHeight" > 0) AND ("scannedHeight" = "tipHeight") AND ("transactionCount" >= 0) AND ("outputCount" >= 0) AND ("evidenceHash" IS NOT NULL) AND ("evidenceHash" ~ '^[a-f0-9]{64}$'::text) AND (evidence IS NOT NULL) AND (NOT ((evidence ->> 'kind'::text) IS DISTINCT FROM 'WALLET_HISTORY_ONLY'::text))))),
    CONSTRAINT "PollCollectionCheck_status_check" CHECK ((status = ANY (ARRAY['RUNNING'::text, 'OBSERVED'::text, 'BLOCKED'::text]))),
    CONSTRAINT "PollCollectionCheck_time" CHECK ((("leaseExpiresAt" > "startedAt") AND (("finishedAt" IS NULL) OR ("finishedAt" >= "startedAt"))))
);


--
-- Name: PollComment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollComment" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "parentId" text,
    "authorUserId" text,
    "authorPollVoterAccessId" text,
    "authorLabel" text NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "hiddenAt" timestamp(3) without time zone,
    "hiddenByUserId" text,
    "hiddenByLabel" text,
    "hideReason" text,
    "requestHash" text,
    "requestKey" text,
    CONSTRAINT "PollComment_author_check" CHECK ((("authorUserId" IS NOT NULL) <> ("authorPollVoterAccessId" IS NOT NULL))),
    CONSTRAINT "PollComment_moderation_check" CHECK (((("hiddenAt" IS NULL) AND ("hiddenByUserId" IS NULL) AND ("hiddenByLabel" IS NULL) AND ("hideReason" IS NULL)) OR (("hiddenAt" IS NOT NULL) AND ("hiddenByUserId" IS NOT NULL) AND ("hiddenByLabel" IS NOT NULL) AND (length(btrim("hiddenByLabel")) > 0) AND ("hideReason" IS NOT NULL) AND ((length(btrim("hideReason")) >= 1) AND (length(btrim("hideReason")) <= 500))))),
    CONSTRAINT "PollComment_request_check" CHECK (((("requestKey" IS NULL) AND ("requestHash" IS NULL)) OR (("requestKey" IS NOT NULL) AND ("requestHash" IS NOT NULL) AND ((char_length("requestKey") >= 1) AND (char_length("requestKey") <= 128)) AND ("requestHash" ~ '^[a-f0-9]{64}$'::text))))
);


--
-- Name: PollCommentReaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollCommentReaction" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "commentId" text NOT NULL,
    "actorKey" text NOT NULL,
    "authorUserId" text,
    "authorPollVoterAccessId" text,
    active boolean DEFAULT true NOT NULL,
    "chargedBefore" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "PollCommentReaction_actor_check" CHECK (((("authorUserId" IS NOT NULL) AND ("authorPollVoterAccessId" IS NULL) AND ("actorKey" = ('user:'::text || "authorUserId"))) OR (("authorUserId" IS NULL) AND ("authorPollVoterAccessId" IS NOT NULL) AND ("actorKey" = ('access:'::text || "authorPollVoterAccessId")))))
);


--
-- Name: PollCommentReactionRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollCommentReactionRequest" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "commentId" text NOT NULL,
    "actorKey" text NOT NULL,
    "requestKey" text NOT NULL,
    "payloadHash" text NOT NULL,
    liked boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PollCommentReactionRequest_shape_check" CHECK ((("actorKey" ~ '^(user|access):[^[:space:]]+$'::text) AND (char_length("actorKey") <= 160) AND ((char_length("requestKey") >= 1) AND (char_length("requestKey") <= 128)) AND ("payloadHash" ~ '^[a-f0-9]{64}$'::text)))
);


--
-- Name: PollEligibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollEligibility" (
    "pollId" text NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: PollInvite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollInvite" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "userId" text,
    "pollVoterAccessId" text,
    email text,
    "signalUsername" text,
    "deliveryChannel" public."PollInviteDeliveryChannel" DEFAULT 'EMAIL'::public."PollInviteDeliveryChannel" NOT NULL,
    "inviteToken" text NOT NULL,
    status public."PollInviteStatus" DEFAULT 'PENDING'::public."PollInviteStatus" NOT NULL,
    "resendEmailId" text,
    "signalMessageId" text,
    "sentAt" timestamp(3) without time zone,
    "openedAt" timestamp(3) without time zone,
    "lastError" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PollTally; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollTally" (
    "pollId" text NOT NULL,
    "countA" integer DEFAULT 0 NOT NULL,
    "countB" integer DEFAULT 0 NOT NULL,
    "countC" integer DEFAULT 0 NOT NULL,
    "countD" integer DEFAULT 0 NOT NULL,
    "countE" integer DEFAULT 0 NOT NULL,
    "totalConfirmed" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PollVoterAccess; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PollVoterAccess" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    nick text NOT NULL,
    email text,
    "signalUsername" text,
    "passwordHash" text,
    status public."PollVoterAccessStatus" DEFAULT 'ACTIVE'::public."PollVoterAccessStatus" NOT NULL,
    "inviteToken" text NOT NULL,
    "passwordIssuedAt" timestamp(3) without time zone,
    "lastLoginAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ProposalAbandonment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalAbandonment" (
    "archiveId" text NOT NULL,
    "submissionId" text NOT NULL,
    "eventId" text NOT NULL,
    "requestKey" text NOT NULL,
    CONSTRAINT "ProposalAbandonment_requestKey_check" CHECK ((char_length("requestKey") = 36))
);


--
-- Name: ProposalArchive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalArchive" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "recordId" text NOT NULL,
    title text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "committeeId" text,
    labels text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "labelsVersion" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ProposalArchive_labels_bounds" CHECK (((cardinality(labels) <= 100) AND ("labelsVersion" >= 0)))
);


--
-- Name: ProposalDraftDeletion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalDraftDeletion" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "committeeId" text NOT NULL,
    "authorId" text NOT NULL,
    version integer NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProposalDraftDeletion_version_check" CHECK ((version > 0))
);


--
-- Name: ProposalFundingQuote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalFundingQuote" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "actorId" text NOT NULL,
    "requestKey" text NOT NULL,
    "proposalHash" text NOT NULL,
    "usdCents" bigint NOT NULL,
    "rateUsdPerZecE8" bigint NOT NULL,
    "amountZat" bigint NOT NULL,
    source text DEFAULT 'COINGECKO'::text NOT NULL,
    "quotedAt" timestamp(3) without time zone NOT NULL,
    "retrievedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text) NOT NULL,
    rounding text DEFAULT 'CEILING_ZAT'::text NOT NULL,
    fees text DEFAULT 'EXCLUDED'::text NOT NULL,
    CONSTRAINT "ProposalFundingQuote_values_check" CHECK ((("usdCents" > 0) AND (("rateUsdPerZecE8" >= 1) AND ("rateUsdPerZecE8" <= '1000000000000000'::bigint)) AND (("amountZat" >= 1) AND ("amountZat" <= '2100000000000000'::bigint)) AND (("amountZat")::numeric = ceil(((("usdCents")::numeric * ('100000000000000'::bigint)::numeric) / (NULLIF("rateUsdPerZecE8", 0))::numeric))) AND (source = 'COINGECKO'::text) AND (rounding = 'CEILING_ZAT'::text) AND (fees = 'EXCLUDED'::text) AND ("proposalHash" ~ '^[a-f0-9]{64}$'::text) AND ("requestKey" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'::text) AND ("quotedAt" <= "retrievedAt") AND ("retrievedAt" < "expiresAt") AND ("expiresAt" = LEAST(("quotedAt" + '00:05:00'::interval), (date_trunc('day'::text, "quotedAt") + '1 day'::interval)))))
);


--
-- Name: ProposalSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalSubmission" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "committeeId" text NOT NULL,
    "authorId" text NOT NULL,
    payload jsonb NOT NULL,
    "contentHash" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    state text DEFAULT 'DRAFT'::text NOT NULL,
    "requestKey" text,
    "recordId" text,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "ProposalSubmission_check" CHECK ((((state = 'DRAFT'::text) AND ("requestKey" IS NULL) AND ("recordId" IS NULL) AND ("submittedAt" IS NULL)) OR ((state = ANY (ARRAY['PUBLISHED_DEMO'::text, 'PUBLISHED'::text])) AND ("requestKey" IS NOT NULL) AND ("recordId" IS NOT NULL) AND ("submittedAt" IS NOT NULL)))),
    CONSTRAINT "ProposalSubmission_contentHash_check" CHECK (("contentHash" ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT "ProposalSubmission_state_check" CHECK ((state = ANY (ARRAY['DRAFT'::text, 'PUBLISHED_DEMO'::text, 'PUBLISHED'::text]))),
    CONSTRAINT "ProposalSubmission_version_check" CHECK ((version > 0))
);


--
-- Name: PublicAuditEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PublicAuditEvent" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "eventType" public."PublicAuditEventType" NOT NULL,
    "sourceKey" text NOT NULL,
    summary text NOT NULL,
    txid text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SignedDecisionBallot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignedDecisionBallot" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "voterId" text NOT NULL,
    "ballotJson" text NOT NULL,
    "ballotHash" text NOT NULL,
    "recordedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SignedDecisionChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignedDecisionChallenge" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "userId" text NOT NULL,
    envelope text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SignedDecisionRound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignedDecisionRound" (
    id text NOT NULL,
    "revisionId" text NOT NULL,
    "scopeId" text NOT NULL,
    "manifestJson" text NOT NULL,
    "manifestHash" text NOT NULL,
    "closesAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT signed_round_deadline_by_format CHECK (
CASE
    WHEN ((("manifestJson")::jsonb ->> 'schema'::text) = 'PARTICIPATE_DECISION_ROUND_V4'::text) THEN ("closesAt" IS NULL)
    ELSE ("closesAt" IS NOT NULL)
END)
);


--
-- Name: SignedDecisionVoter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignedDecisionVoter" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "userId" text NOT NULL,
    "keyIds" text[] NOT NULL
);


--
-- Name: TicketAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketAssignment" (
    "ticketId" text NOT NULL,
    "pollId" text NOT NULL,
    "userId" text,
    "pollVoterAccessId" text
);


--
-- Name: TreasuryLedgerEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TreasuryLedgerEntry" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    "treasuryId" text NOT NULL,
    "operationId" text NOT NULL,
    "deltaZat" bigint NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "TreasuryLedgerEntry_delta_check" CHECK ((("deltaZat" <> 0) AND (("deltaZat" >= '-2100000000000000'::bigint) AND ("deltaZat" <= '2100000000000000'::bigint))))
);


--
-- Name: TreasuryOperation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TreasuryOperation" (
    id text NOT NULL,
    "communityId" text NOT NULL,
    kind public."TreasuryOperationKind" NOT NULL,
    "sourceTreasuryId" text,
    "destinationTreasuryId" text NOT NULL,
    "amountZat" bigint NOT NULL,
    currency text DEFAULT 'ZEC'::text NOT NULL,
    "fundingSource" text,
    reason text NOT NULL,
    "actorUserId" text NOT NULL,
    "actorLabel" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "payloadHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "TreasuryOperation_shape_check" CHECK (((currency = 'ZEC'::text) AND (("amountZat" >= 1) AND ("amountZat" <= '2100000000000000'::bigint)) AND ((length(btrim(reason)) >= 3) AND (length(btrim(reason)) <= 500)) AND (length(btrim("actorLabel")) > 0) AND ("idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND ("payloadHash" ~ '^[0-9a-f]{64}$'::text) AND (((kind = 'FUNDING'::public."TreasuryOperationKind") AND ("sourceTreasuryId" IS NULL) AND ("fundingSource" IS NOT NULL) AND ((length(btrim("fundingSource")) >= 3) AND (length(btrim("fundingSource")) <= 200))) OR ((kind = 'ALLOCATION'::public."TreasuryOperationKind") AND ("sourceTreasuryId" IS NOT NULL) AND ("sourceTreasuryId" <> "destinationTreasuryId") AND ("fundingSource" IS NULL)))))
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    nick text NOT NULL,
    email text,
    "passwordHash" text NOT NULL,
    role public."UserRole" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "displayName" text,
    "avatarUrl" text,
    "shareProfileInDiscussion" boolean DEFAULT false NOT NULL,
    "emailVerifiedAt" timestamp(3) without time zone
);


--
-- Name: VoteReceipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VoteReceipt" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "ticketHash" text NOT NULL,
    "receiptPublicId" text,
    "receiptEmailId" text,
    "receiptEmailSentAt" timestamp(3) without time zone,
    "receiptEmailError" text,
    "receiptSignalMessageId" text,
    "receiptSignalSentAt" timestamp(3) without time zone,
    "receiptSignalError" text,
    "optionLetter" public."VoteOptionLetter" NOT NULL,
    txid text NOT NULL,
    "blockHeight" integer,
    "amountZat" bigint NOT NULL,
    memo text NOT NULL,
    status public."VoteReceiptStatus" DEFAULT 'PENDING'::public."VoteReceiptStatus" NOT NULL,
    "rejectionReason" text,
    "confirmedAt" timestamp(3) without time zone
);


--
-- Name: VoteRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VoteRequest" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    "optionLetter" public."VoteOptionLetter" NOT NULL,
    "shieldedAddress" text NOT NULL,
    "zip321Uri" text NOT NULL,
    status public."VoteRequestStatus" DEFAULT 'ACTIVE'::public."VoteRequestStatus" NOT NULL
);


--
-- Name: VoteTicket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VoteTicket" (
    id text NOT NULL,
    "pollId" text NOT NULL,
    "ticketPublicId" text NOT NULL,
    "ticketHash" text NOT NULL,
    status public."TicketStatus" DEFAULT 'ISSUED'::public."TicketStatus" NOT NULL,
    "lockedOptionLetter" public."VoteOptionLetter",
    "lockedRequestId" text,
    "lockedAt" timestamp(3) without time zone,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone
);


--
-- Name: ActivityAutomationJob ActivityAutomationJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityAutomationJob"
    ADD CONSTRAINT "ActivityAutomationJob_pkey" PRIMARY KEY ("batchId");


--
-- Name: ArchiveActivityActor ArchiveActivityActor_archiveId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityActor"
    ADD CONSTRAINT "ArchiveActivityActor_archiveId_userId_key" UNIQUE ("archiveId", "userId");


--
-- Name: ArchiveActivityActor ArchiveActivityActor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityActor"
    ADD CONSTRAINT "ArchiveActivityActor_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveActivityBatch ArchiveActivityBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityBatch"
    ADD CONSTRAINT "ArchiveActivityBatch_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveActivityCheck ArchiveActivityCheck_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityCheck"
    ADD CONSTRAINT "ArchiveActivityCheck_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_archiveId_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityEvent"
    ADD CONSTRAINT "ArchiveActivityEvent_archiveId_sequence_key" UNIQUE ("archiveId", sequence);


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_archiveId_sourceKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityEvent"
    ADD CONSTRAINT "ArchiveActivityEvent_archiveId_sourceKey_key" UNIQUE ("archiveId", "sourceKey");


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_eventHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityEvent"
    ADD CONSTRAINT "ArchiveActivityEvent_eventHash_key" UNIQUE ("eventHash");


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityEvent"
    ADD CONSTRAINT "ArchiveActivityEvent_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveActivityInclusion ArchiveActivityInclusion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityInclusion"
    ADD CONSTRAINT "ArchiveActivityInclusion_pkey" PRIMARY KEY ("eventId");


--
-- Name: ArchiveAnchorCheck ArchiveAnchorCheck_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveAnchorCheck"
    ADD CONSTRAINT "ArchiveAnchorCheck_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveAnchor ArchiveAnchor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveAnchor"
    ADD CONSTRAINT "ArchiveAnchor_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_commentId_requestKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveCommentVersion"
    ADD CONSTRAINT "ArchiveCommentVersion_commentId_requestKey_key" UNIQUE ("commentId", "requestKey");


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_commentId_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveCommentVersion"
    ADD CONSTRAINT "ArchiveCommentVersion_commentId_version_key" UNIQUE ("commentId", version);


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveCommentVersion"
    ADD CONSTRAINT "ArchiveCommentVersion_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveComment ArchiveComment_id_archive_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_id_archive_unique" UNIQUE (id, "archiveId");


--
-- Name: ArchiveComment ArchiveComment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveDiscussionClosure"
    ADD CONSTRAINT "ArchiveDiscussionClosure_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_revisionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveDiscussionClosure"
    ADD CONSTRAINT "ArchiveDiscussionClosure_revisionId_key" UNIQUE ("revisionId");


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_snapshotHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveDiscussionClosure"
    ADD CONSTRAINT "ArchiveDiscussionClosure_snapshotHash_key" UNIQUE ("snapshotHash");


--
-- Name: ArchiveProposalLikeRequest ArchiveProposalLikeRequest_archiveId_userId_requestKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLikeRequest"
    ADD CONSTRAINT "ArchiveProposalLikeRequest_archiveId_userId_requestKey_key" UNIQUE ("archiveId", "userId", "requestKey");


--
-- Name: ArchiveProposalLikeRequest ArchiveProposalLikeRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLikeRequest"
    ADD CONSTRAINT "ArchiveProposalLikeRequest_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveProposalLike ArchiveProposalLike_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLike"
    ADD CONSTRAINT "ArchiveProposalLike_pkey" PRIMARY KEY ("archiveId", "userId");


--
-- Name: ArchiveReactionRequest ArchiveReactionRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReactionRequest"
    ADD CONSTRAINT "ArchiveReactionRequest_pkey" PRIMARY KEY (id);


--
-- Name: ArchiveReaction ArchiveReaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReaction"
    ADD CONSTRAINT "ArchiveReaction_pkey" PRIMARY KEY ("commentId", "userId", version);


--
-- Name: ArchiveRevision ArchiveRevision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveRevision"
    ADD CONSTRAINT "ArchiveRevision_pkey" PRIMARY KEY (id);


--
-- Name: CommitteeEvent CommitteeEvent_communityId_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeEvent"
    ADD CONSTRAINT "CommitteeEvent_communityId_sequence_key" UNIQUE ("communityId", sequence);


--
-- Name: CommitteeEvent CommitteeEvent_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeEvent"
    ADD CONSTRAINT "CommitteeEvent_hash_key" UNIQUE (hash);


--
-- Name: CommitteeEvent CommitteeEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeEvent"
    ADD CONSTRAINT "CommitteeEvent_pkey" PRIMARY KEY (id);


--
-- Name: CommitteeInvitation CommitteeInvitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeInvitation"
    ADD CONSTRAINT "CommitteeInvitation_pkey" PRIMARY KEY (id);


--
-- Name: CommitteePolicy CommitteePolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteePolicy"
    ADD CONSTRAINT "CommitteePolicy_pkey" PRIMARY KEY ("communityId");


--
-- Name: CommunityMembership CommunityMembership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunityMembership"
    ADD CONSTRAINT "CommunityMembership_pkey" PRIMARY KEY (id);


--
-- Name: CommunityTreasury CommunityTreasury_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunityTreasury"
    ADD CONSTRAINT "CommunityTreasury_pkey" PRIMARY KEY (id);


--
-- Name: Community Community_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Community"
    ADD CONSTRAINT "Community_pkey" PRIMARY KEY (id);


--
-- Name: CreditAccount CreditAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditAccount"
    ADD CONSTRAINT "CreditAccount_pkey" PRIMARY KEY (id);


--
-- Name: CreditOperation CreditOperation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditOperation"
    ADD CONSTRAINT "CreditOperation_pkey" PRIMARY KEY (id);


--
-- Name: CreditPaymentReceipt CreditPaymentReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPaymentReceipt"
    ADD CONSTRAINT "CreditPaymentReceipt_pkey" PRIMARY KEY (id);


--
-- Name: CreditPurchase CreditPurchase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPurchase"
    ADD CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY (id);


--
-- Name: DaoMember DaoMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMember"
    ADD CONSTRAINT "DaoMember_pkey" PRIMARY KEY (id);


--
-- Name: DaoMembershipAction DaoMembershipAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipAction"
    ADD CONSTRAINT "DaoMembershipAction_pkey" PRIMARY KEY (id);


--
-- Name: DaoMembershipRequest DaoMembershipRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipRequest"
    ADD CONSTRAINT "DaoMembershipRequest_pkey" PRIMARY KEY (id);


--
-- Name: DiscussionNotification DiscussionNotification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DiscussionNotification"
    ADD CONSTRAINT "DiscussionNotification_pkey" PRIMARY KEY (id);


--
-- Name: EmailAuthChallenge EmailAuthChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailAuthChallenge"
    ADD CONSTRAINT "EmailAuthChallenge_pkey" PRIMARY KEY (id);


--
-- Name: EmailAuthThrottle EmailAuthThrottle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailAuthThrottle"
    ADD CONSTRAINT "EmailAuthThrottle_pkey" PRIMARY KEY (id);


--
-- Name: FundingQuoteThrottle FundingQuoteThrottle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FundingQuoteThrottle"
    ADD CONSTRAINT "FundingQuoteThrottle_pkey" PRIMARY KEY ("userId");


--
-- Name: ParticipateAutomationJob ParticipateAutomationJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateAutomationJob"
    ADD CONSTRAINT "ParticipateAutomationJob_pkey" PRIMARY KEY (id);


--
-- Name: ParticipateAutomationLog ParticipateAutomationLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateAutomationLog"
    ADD CONSTRAINT "ParticipateAutomationLog_pkey" PRIMARY KEY (id);


--
-- Name: ParticipateAutomationState ParticipateAutomationState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateAutomationState"
    ADD CONSTRAINT "ParticipateAutomationState_pkey" PRIMARY KEY ("hostId");


--
-- Name: ParticipateSourceCheckpoint ParticipateSourceCheckpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateSourceCheckpoint"
    ADD CONSTRAINT "ParticipateSourceCheckpoint_pkey" PRIMARY KEY ("hostId", "issueNumber");


--
-- Name: PasskeyChallenge PasskeyChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasskeyChallenge"
    ADD CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY (id);


--
-- Name: PasskeyThrottle PasskeyThrottle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasskeyThrottle"
    ADD CONSTRAINT "PasskeyThrottle_pkey" PRIMARY KEY (id);


--
-- Name: Passkey Passkey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Passkey"
    ADD CONSTRAINT "Passkey_pkey" PRIMARY KEY (id);


--
-- Name: PollCollectionCheck PollCollectionCheck_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCollectionCheck"
    ADD CONSTRAINT "PollCollectionCheck_pkey" PRIMARY KEY (id);


--
-- Name: PollCommentReactionRequest PollCommentReactionRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReactionRequest"
    ADD CONSTRAINT "PollCommentReactionRequest_pkey" PRIMARY KEY (id);


--
-- Name: PollCommentReaction PollCommentReaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReaction"
    ADD CONSTRAINT "PollCommentReaction_pkey" PRIMARY KEY (id);


--
-- Name: PollComment PollComment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_pkey" PRIMARY KEY (id);


--
-- Name: PollEligibility PollEligibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollEligibility"
    ADD CONSTRAINT "PollEligibility_pkey" PRIMARY KEY ("pollId", "userId");


--
-- Name: PollInvite PollInvite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollInvite"
    ADD CONSTRAINT "PollInvite_pkey" PRIMARY KEY (id);


--
-- Name: PollTally PollTally_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollTally"
    ADD CONSTRAINT "PollTally_pkey" PRIMARY KEY ("pollId");


--
-- Name: PollVoterAccess PollVoterAccess_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollVoterAccess"
    ADD CONSTRAINT "PollVoterAccess_pkey" PRIMARY KEY (id);


--
-- Name: Poll Poll_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Poll"
    ADD CONSTRAINT "Poll_pkey" PRIMARY KEY (id);


--
-- Name: ProposalAbandonment ProposalAbandonment_eventId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_eventId_key" UNIQUE ("eventId");


--
-- Name: ProposalAbandonment ProposalAbandonment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_pkey" PRIMARY KEY ("archiveId");


--
-- Name: ProposalAbandonment ProposalAbandonment_submissionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_submissionId_key" UNIQUE ("submissionId");


--
-- Name: ProposalArchive ProposalArchive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalArchive"
    ADD CONSTRAINT "ProposalArchive_pkey" PRIMARY KEY (id);


--
-- Name: ProposalDraftDeletion ProposalDraftDeletion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalDraftDeletion"
    ADD CONSTRAINT "ProposalDraftDeletion_pkey" PRIMARY KEY (id);


--
-- Name: ProposalFundingQuote ProposalFundingQuote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalFundingQuote"
    ADD CONSTRAINT "ProposalFundingQuote_pkey" PRIMARY KEY (id);


--
-- Name: ProposalSubmission ProposalSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalSubmission"
    ADD CONSTRAINT "ProposalSubmission_pkey" PRIMARY KEY (id);


--
-- Name: ProposalSubmission ProposalSubmission_recordId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalSubmission"
    ADD CONSTRAINT "ProposalSubmission_recordId_key" UNIQUE ("recordId");


--
-- Name: PublicAuditEvent PublicAuditEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicAuditEvent"
    ADD CONSTRAINT "PublicAuditEvent_pkey" PRIMARY KEY (id);


--
-- Name: SignedDecisionBallot SignedDecisionBallot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionBallot"
    ADD CONSTRAINT "SignedDecisionBallot_pkey" PRIMARY KEY (id);


--
-- Name: SignedDecisionBallot SignedDecisionBallot_voterId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionBallot"
    ADD CONSTRAINT "SignedDecisionBallot_voterId_key" UNIQUE ("voterId");


--
-- Name: SignedDecisionChallenge SignedDecisionChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionChallenge"
    ADD CONSTRAINT "SignedDecisionChallenge_pkey" PRIMARY KEY (id);


--
-- Name: SignedDecisionChallenge SignedDecisionChallenge_roundId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionChallenge"
    ADD CONSTRAINT "SignedDecisionChallenge_roundId_userId_key" UNIQUE ("roundId", "userId");


--
-- Name: SignedDecisionRound SignedDecisionRound_manifestHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionRound"
    ADD CONSTRAINT "SignedDecisionRound_manifestHash_key" UNIQUE ("manifestHash");


--
-- Name: SignedDecisionRound SignedDecisionRound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionRound"
    ADD CONSTRAINT "SignedDecisionRound_pkey" PRIMARY KEY (id);


--
-- Name: SignedDecisionRound SignedDecisionRound_revisionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionRound"
    ADD CONSTRAINT "SignedDecisionRound_revisionId_key" UNIQUE ("revisionId");


--
-- Name: SignedDecisionVoter SignedDecisionVoter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionVoter"
    ADD CONSTRAINT "SignedDecisionVoter_pkey" PRIMARY KEY (id);


--
-- Name: SignedDecisionVoter SignedDecisionVoter_roundId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionVoter"
    ADD CONSTRAINT "SignedDecisionVoter_roundId_userId_key" UNIQUE ("roundId", "userId");


--
-- Name: TicketAssignment TicketAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_pkey" PRIMARY KEY ("ticketId");


--
-- Name: TreasuryLedgerEntry TreasuryLedgerEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryLedgerEntry"
    ADD CONSTRAINT "TreasuryLedgerEntry_pkey" PRIMARY KEY (id);


--
-- Name: TreasuryOperation TreasuryOperation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryOperation"
    ADD CONSTRAINT "TreasuryOperation_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VoteReceipt VoteReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteReceipt"
    ADD CONSTRAINT "VoteReceipt_pkey" PRIMARY KEY (id);


--
-- Name: VoteRequest VoteRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteRequest"
    ADD CONSTRAINT "VoteRequest_pkey" PRIMARY KEY (id);


--
-- Name: VoteTicket VoteTicket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteTicket"
    ADD CONSTRAINT "VoteTicket_pkey" PRIMARY KEY (id);


--
-- Name: ActivityAutomationJob_state_nextAttemptAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityAutomationJob_state_nextAttemptAt_idx" ON public."ActivityAutomationJob" USING btree (state, "nextAttemptAt");


--
-- Name: ArchiveActivityBatch_communityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveActivityBatch_communityId_createdAt_idx" ON public."ArchiveActivityBatch" USING btree ("communityId", "createdAt");


--
-- Name: ArchiveActivityCheck_batchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveActivityCheck_batchId_createdAt_idx" ON public."ArchiveActivityCheck" USING btree ("batchId", "createdAt");


--
-- Name: ArchiveActivityInclusion_batchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveActivityInclusion_batchId_idx" ON public."ArchiveActivityInclusion" USING btree ("batchId");


--
-- Name: ArchiveAnchorCheck_anchorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveAnchorCheck_anchorId_createdAt_idx" ON public."ArchiveAnchorCheck" USING btree ("anchorId", "createdAt");


--
-- Name: ArchiveAnchor_revisionId_network_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ArchiveAnchor_revisionId_network_key" ON public."ArchiveAnchor" USING btree ("revisionId", network);


--
-- Name: ArchiveComment_archiveId_authorId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ArchiveComment_archiveId_authorId_requestKey_key" ON public."ArchiveComment" USING btree ("archiveId", "authorId", "requestKey");


--
-- Name: ArchiveComment_archiveId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveComment_archiveId_createdAt_idx" ON public."ArchiveComment" USING btree ("archiveId", "createdAt");


--
-- Name: ArchiveComment_authorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveComment_authorId_createdAt_idx" ON public."ArchiveComment" USING btree ("authorId", "createdAt");


--
-- Name: ArchiveDiscussionClosure_archiveId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveDiscussionClosure_archiveId_createdAt_idx" ON public."ArchiveDiscussionClosure" USING btree ("archiveId", "createdAt");


--
-- Name: ArchiveProposalLikeRequest_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveProposalLikeRequest_userId_createdAt_idx" ON public."ArchiveProposalLikeRequest" USING btree ("userId", "createdAt");


--
-- Name: ArchiveReactionRequest_commentId_userId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ArchiveReactionRequest_commentId_userId_requestKey_key" ON public."ArchiveReactionRequest" USING btree ("commentId", "userId", "requestKey");


--
-- Name: ArchiveReactionRequest_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ArchiveReactionRequest_userId_createdAt_idx" ON public."ArchiveReactionRequest" USING btree ("userId", "createdAt");


--
-- Name: ArchiveRevision_archiveId_manifestHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ArchiveRevision_archiveId_manifestHash_key" ON public."ArchiveRevision" USING btree ("archiveId", "manifestHash");


--
-- Name: ArchiveRevision_archiveId_revision_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ArchiveRevision_archiveId_revision_key" ON public."ArchiveRevision" USING btree ("archiveId", revision);


--
-- Name: CommitteeInvitation_communityId_email_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommitteeInvitation_communityId_email_createdAt_idx" ON public."CommitteeInvitation" USING btree ("communityId", email, "createdAt");


--
-- Name: CommunityMembership_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CommunityMembership_communityId_userId_key" ON public."CommunityMembership" USING btree ("communityId", "userId");


--
-- Name: CommunityMembership_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunityMembership_userId_status_idx" ON public."CommunityMembership" USING btree ("userId", status);


--
-- Name: CommunityTreasury_communityId_kind_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CommunityTreasury_communityId_kind_key" ON public."CommunityTreasury" USING btree ("communityId", kind);


--
-- Name: CommunityTreasury_id_communityId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CommunityTreasury_id_communityId_key" ON public."CommunityTreasury" USING btree (id, "communityId");


--
-- Name: Community_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Community_slug_key" ON public."Community" USING btree (slug);


--
-- Name: CreditAccount_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditAccount_communityId_userId_key" ON public."CreditAccount" USING btree ("communityId", "userId");


--
-- Name: CreditAccount_id_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditAccount_id_communityId_userId_key" ON public."CreditAccount" USING btree (id, "communityId", "userId");


--
-- Name: CreditAccount_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CreditAccount_userId_createdAt_idx" ON public."CreditAccount" USING btree ("userId", "createdAt");


--
-- Name: CreditOperation_accountId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditOperation_accountId_requestKey_key" ON public."CreditOperation" USING btree ("accountId", "requestKey");


--
-- Name: CreditOperation_one_preview_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditOperation_one_preview_grant" ON public."CreditOperation" USING btree ("accountId") WHERE (kind = 'PREVIEW_GRANT'::public."CreditOperationKind");


--
-- Name: CreditOperation_purchaseId_accountId_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditOperation_purchaseId_accountId_communityId_userId_key" ON public."CreditOperation" USING btree ("purchaseId", "accountId", "communityId", "userId");


--
-- Name: CreditOperation_purchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditOperation_purchaseId_key" ON public."CreditOperation" USING btree ("purchaseId");


--
-- Name: CreditOperation_userId_communityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CreditOperation_userId_communityId_createdAt_idx" ON public."CreditOperation" USING btree ("userId", "communityId", "createdAt");


--
-- Name: CreditPaymentReceipt_network_txid_pool_outputIndex_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPaymentReceipt_network_txid_pool_outputIndex_key" ON public."CreditPaymentReceipt" USING btree (network, txid, pool, "outputIndex");


--
-- Name: CreditPaymentReceipt_purchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPaymentReceipt_purchaseId_key" ON public."CreditPaymentReceipt" USING btree ("purchaseId");


--
-- Name: CreditPurchase_communityId_userId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPurchase_communityId_userId_requestKey_key" ON public."CreditPurchase" USING btree ("communityId", "userId", "requestKey");


--
-- Name: CreditPurchase_creditAccountId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CreditPurchase_creditAccountId_createdAt_idx" ON public."CreditPurchase" USING btree ("creditAccountId", "createdAt");


--
-- Name: CreditPurchase_id_creditAccountId_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPurchase_id_creditAccountId_communityId_userId_key" ON public."CreditPurchase" USING btree (id, "creditAccountId", "communityId", "userId");


--
-- Name: CreditPurchase_memo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPurchase_memo_key" ON public."CreditPurchase" USING btree (memo);


--
-- Name: CreditPurchase_one_open_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CreditPurchase_one_open_account" ON public."CreditPurchase" USING btree ("creditAccountId") WHERE (status = ANY (ARRAY['PENDING'::public."CreditPurchaseState", 'CONFIRMING'::public."CreditPurchaseState"]));


--
-- Name: CreditPurchase_status_lastCheckedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CreditPurchase_status_lastCheckedAt_idx" ON public."CreditPurchase" USING btree (status, "lastCheckedAt");


--
-- Name: CreditPurchase_userId_communityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CreditPurchase_userId_communityId_createdAt_idx" ON public."CreditPurchase" USING btree ("userId", "communityId", "createdAt");


--
-- Name: DaoMember_communityId_nick_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMember_communityId_nick_key" ON public."DaoMember" USING btree ("communityId", nick);


--
-- Name: DaoMember_communityId_signalUsername_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMember_communityId_signalUsername_key" ON public."DaoMember" USING btree ("communityId", "signalUsername");


--
-- Name: DaoMember_communityId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DaoMember_communityId_status_idx" ON public."DaoMember" USING btree ("communityId", status);


--
-- Name: DaoMember_communityId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMember_communityId_userId_key" ON public."DaoMember" USING btree ("communityId", "userId");


--
-- Name: DaoMember_legacy_nick_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMember_legacy_nick_key" ON public."DaoMember" USING btree (nick) WHERE ("communityId" IS NULL);


--
-- Name: DaoMember_legacy_signalUsername_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMember_legacy_signalUsername_key" ON public."DaoMember" USING btree ("signalUsername") WHERE ("communityId" IS NULL);


--
-- Name: DaoMembershipAction_pollId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMembershipAction_pollId_key" ON public."DaoMembershipAction" USING btree ("pollId");


--
-- Name: DaoMembershipAction_requestId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMembershipAction_requestId_key" ON public."DaoMembershipAction" USING btree ("requestId");


--
-- Name: DaoMembershipRequest_communityId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DaoMembershipRequest_communityId_status_createdAt_idx" ON public."DaoMembershipRequest" USING btree ("communityId", status, "createdAt");


--
-- Name: DaoMembershipRequest_one_open_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DaoMembershipRequest_one_open_attempt" ON public."DaoMembershipRequest" USING btree ("communityId", "userId") WHERE (status = ANY (ARRAY['PENDING'::public."DaoMembershipRequestStatus", 'PROPOSED'::public."DaoMembershipRequestStatus"]));


--
-- Name: DaoMembershipRequest_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DaoMembershipRequest_userId_createdAt_idx" ON public."DaoMembershipRequest" USING btree ("userId", "createdAt");


--
-- Name: DiscussionNotification_kind_actorId_commentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DiscussionNotification_kind_actorId_commentId_key" ON public."DiscussionNotification" USING btree (kind, "actorId", "commentId");


--
-- Name: DiscussionNotification_kind_recipientId_archiveId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DiscussionNotification_kind_recipientId_archiveId_key" ON public."DiscussionNotification" USING btree (kind, "recipientId", "archiveId");


--
-- Name: DiscussionNotification_recipientId_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DiscussionNotification_recipientId_createdAt_id_idx" ON public."DiscussionNotification" USING btree ("recipientId", "createdAt", id);


--
-- Name: DiscussionNotification_recipientId_readAt_withdrawnAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DiscussionNotification_recipientId_readAt_withdrawnAt_idx" ON public."DiscussionNotification" USING btree ("recipientId", "readAt", "withdrawnAt");


--
-- Name: EmailAuthChallenge_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailAuthChallenge_expiresAt_idx" ON public."EmailAuthChallenge" USING btree ("expiresAt");


--
-- Name: EmailAuthThrottle_resetsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailAuthThrottle_resetsAt_idx" ON public."EmailAuthThrottle" USING btree ("resetsAt");


--
-- Name: ParticipateAutomationJob_hostId_issueNumber_revision_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ParticipateAutomationJob_hostId_issueNumber_revision_key" ON public."ParticipateAutomationJob" USING btree ("hostId", "issueNumber", revision);


--
-- Name: ParticipateAutomationJob_hostId_nextAttemptAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ParticipateAutomationJob_hostId_nextAttemptAt_idx" ON public."ParticipateAutomationJob" USING btree ("hostId", "nextAttemptAt");


--
-- Name: ParticipateAutomationLog_hostId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ParticipateAutomationLog_hostId_createdAt_idx" ON public."ParticipateAutomationLog" USING btree ("hostId", "createdAt");


--
-- Name: ParticipateSourceCheckpoint_hostId_checkedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ParticipateSourceCheckpoint_hostId_checkedAt_idx" ON public."ParticipateSourceCheckpoint" USING btree ("hostId", "checkedAt");


--
-- Name: PasskeyChallenge_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON public."PasskeyChallenge" USING btree ("expiresAt");


--
-- Name: Passkey_credentialId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON public."Passkey" USING btree ("credentialId");


--
-- Name: Passkey_userId_rpId_revokedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Passkey_userId_rpId_revokedAt_idx" ON public."Passkey" USING btree ("userId", "rpId", "revokedAt");


--
-- Name: PollCollectionCheck_pollId_actorId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollCollectionCheck_pollId_actorId_requestKey_key" ON public."PollCollectionCheck" USING btree ("pollId", "actorId", "requestKey");


--
-- Name: PollCollectionCheck_pollId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollCollectionCheck_pollId_startedAt_idx" ON public."PollCollectionCheck" USING btree ("pollId", "startedAt");


--
-- Name: PollCommentReactionRequest_commentId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollCommentReactionRequest_commentId_createdAt_idx" ON public."PollCommentReactionRequest" USING btree ("commentId", "createdAt");


--
-- Name: PollCommentReactionRequest_pollId_actorKey_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollCommentReactionRequest_pollId_actorKey_createdAt_idx" ON public."PollCommentReactionRequest" USING btree ("pollId", "actorKey", "createdAt");


--
-- Name: PollCommentReactionRequest_pollId_actorKey_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollCommentReactionRequest_pollId_actorKey_requestKey_key" ON public."PollCommentReactionRequest" USING btree ("pollId", "actorKey", "requestKey");


--
-- Name: PollCommentReaction_commentId_actorKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollCommentReaction_commentId_actorKey_key" ON public."PollCommentReaction" USING btree ("commentId", "actorKey");


--
-- Name: PollCommentReaction_pollId_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollCommentReaction_pollId_active_idx" ON public."PollCommentReaction" USING btree ("pollId", active);


--
-- Name: PollComment_authorPollVoterAccessId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollComment_authorPollVoterAccessId_createdAt_idx" ON public."PollComment" USING btree ("authorPollVoterAccessId", "createdAt");


--
-- Name: PollComment_authorUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollComment_authorUserId_createdAt_idx" ON public."PollComment" USING btree ("authorUserId", "createdAt");


--
-- Name: PollComment_id_pollId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollComment_id_pollId_key" ON public."PollComment" USING btree (id, "pollId");


--
-- Name: PollComment_pollId_authorPollVoterAccessId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollComment_pollId_authorPollVoterAccessId_requestKey_key" ON public."PollComment" USING btree ("pollId", "authorPollVoterAccessId", "requestKey");


--
-- Name: PollComment_pollId_authorUserId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollComment_pollId_authorUserId_requestKey_key" ON public."PollComment" USING btree ("pollId", "authorUserId", "requestKey");


--
-- Name: PollComment_pollId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PollComment_pollId_createdAt_idx" ON public."PollComment" USING btree ("pollId", "createdAt");


--
-- Name: PollInvite_inviteToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollInvite_inviteToken_key" ON public."PollInvite" USING btree ("inviteToken");


--
-- Name: PollInvite_pollId_pollVoterAccessId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollInvite_pollId_pollVoterAccessId_key" ON public."PollInvite" USING btree ("pollId", "pollVoterAccessId");


--
-- Name: PollInvite_pollId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollInvite_pollId_userId_key" ON public."PollInvite" USING btree ("pollId", "userId");


--
-- Name: PollVoterAccess_id_pollId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollVoterAccess_id_pollId_key" ON public."PollVoterAccess" USING btree (id, "pollId");


--
-- Name: PollVoterAccess_inviteToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollVoterAccess_inviteToken_key" ON public."PollVoterAccess" USING btree ("inviteToken");


--
-- Name: PollVoterAccess_pollId_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollVoterAccess_pollId_email_key" ON public."PollVoterAccess" USING btree ("pollId", email);


--
-- Name: PollVoterAccess_pollId_nick_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollVoterAccess_pollId_nick_key" ON public."PollVoterAccess" USING btree ("pollId", nick);


--
-- Name: PollVoterAccess_pollId_signalUsername_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PollVoterAccess_pollId_signalUsername_key" ON public."PollVoterAccess" USING btree ("pollId", "signalUsername");


--
-- Name: Poll_communityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Poll_communityId_createdAt_idx" ON public."Poll" USING btree ("communityId", "createdAt");


--
-- Name: ProposalArchive_committeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProposalArchive_committeeId_idx" ON public."ProposalArchive" USING btree ("committeeId");


--
-- Name: ProposalArchive_communityId_recordId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProposalArchive_communityId_recordId_key" ON public."ProposalArchive" USING btree ("communityId", "recordId");


--
-- Name: ProposalDraftDeletion_authorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProposalDraftDeletion_authorId_createdAt_idx" ON public."ProposalDraftDeletion" USING btree ("authorId", "createdAt");


--
-- Name: ProposalFundingQuote_pollId_actorId_requestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProposalFundingQuote_pollId_actorId_requestKey_key" ON public."ProposalFundingQuote" USING btree ("pollId", "actorId", "requestKey");


--
-- Name: ProposalFundingQuote_pollId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProposalFundingQuote_pollId_createdAt_idx" ON public."ProposalFundingQuote" USING btree ("pollId", "createdAt");


--
-- Name: ProposalSubmission_authorId_communityId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProposalSubmission_authorId_communityId_updatedAt_idx" ON public."ProposalSubmission" USING btree ("authorId", "communityId", "updatedAt");


--
-- Name: PublicAuditEvent_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicAuditEvent_createdAt_idx" ON public."PublicAuditEvent" USING btree ("createdAt");


--
-- Name: PublicAuditEvent_pollId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicAuditEvent_pollId_createdAt_idx" ON public."PublicAuditEvent" USING btree ("pollId", "createdAt");


--
-- Name: PublicAuditEvent_sourceKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PublicAuditEvent_sourceKey_key" ON public."PublicAuditEvent" USING btree ("sourceKey");


--
-- Name: SignedDecisionBallot_roundId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignedDecisionBallot_roundId_idx" ON public."SignedDecisionBallot" USING btree ("roundId");


--
-- Name: SignedDecisionChallenge_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignedDecisionChallenge_expiresAt_idx" ON public."SignedDecisionChallenge" USING btree ("expiresAt");


--
-- Name: TicketAssignment_pollId_pollVoterAccessId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TicketAssignment_pollId_pollVoterAccessId_key" ON public."TicketAssignment" USING btree ("pollId", "pollVoterAccessId");


--
-- Name: TicketAssignment_pollId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TicketAssignment_pollId_userId_key" ON public."TicketAssignment" USING btree ("pollId", "userId");


--
-- Name: TicketAssignment_ticketId_pollId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TicketAssignment_ticketId_pollId_key" ON public."TicketAssignment" USING btree ("ticketId", "pollId");


--
-- Name: TreasuryLedgerEntry_operationId_treasuryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TreasuryLedgerEntry_operationId_treasuryId_key" ON public."TreasuryLedgerEntry" USING btree ("operationId", "treasuryId");


--
-- Name: TreasuryLedgerEntry_treasuryId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TreasuryLedgerEntry_treasuryId_createdAt_idx" ON public."TreasuryLedgerEntry" USING btree ("treasuryId", "createdAt");


--
-- Name: TreasuryOperation_communityId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TreasuryOperation_communityId_createdAt_idx" ON public."TreasuryOperation" USING btree ("communityId", "createdAt");


--
-- Name: TreasuryOperation_communityId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TreasuryOperation_communityId_idempotencyKey_key" ON public."TreasuryOperation" USING btree ("communityId", "idempotencyKey");


--
-- Name: TreasuryOperation_id_communityId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TreasuryOperation_id_communityId_key" ON public."TreasuryOperation" USING btree (id, "communityId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_nick_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_nick_key" ON public."User" USING btree (nick);


--
-- Name: VoteReceipt_receiptPublicId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteReceipt_receiptPublicId_key" ON public."VoteReceipt" USING btree ("receiptPublicId");


--
-- Name: VoteReceipt_txid_ticketHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteReceipt_txid_ticketHash_key" ON public."VoteReceipt" USING btree (txid, "ticketHash");


--
-- Name: VoteRequest_shieldedAddress_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteRequest_shieldedAddress_key" ON public."VoteRequest" USING btree ("shieldedAddress");


--
-- Name: VoteRequest_ticketId_optionLetter_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteRequest_ticketId_optionLetter_key" ON public."VoteRequest" USING btree ("ticketId", "optionLetter");


--
-- Name: VoteTicket_id_pollId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteTicket_id_pollId_key" ON public."VoteTicket" USING btree (id, "pollId");


--
-- Name: VoteTicket_ticketHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteTicket_ticketHash_key" ON public."VoteTicket" USING btree ("ticketHash");


--
-- Name: VoteTicket_ticketPublicId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VoteTicket_ticketPublicId_key" ON public."VoteTicket" USING btree ("ticketPublicId");


--
-- Name: committee_pending_invitation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX committee_pending_invitation ON public."CommitteeInvitation" USING btree ("communityId", email) WHERE (("acceptedAt" IS NULL) AND ("revokedAt" IS NULL));


--
-- Name: ArchiveActivityActor ArchiveActivityActor_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityActor_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveActivityActor" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveActivityBatch ArchiveActivityBatch_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityBatch_guard" BEFORE DELETE OR UPDATE ON public."ArchiveActivityBatch" FOR EACH ROW EXECUTE FUNCTION public.archive_activity_batch_guard();


--
-- Name: ArchiveActivityCheck ArchiveActivityCheck_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityCheck_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveActivityCheck" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityEvent_guard" BEFORE INSERT ON public."ArchiveActivityEvent" FOR EACH ROW EXECUTE FUNCTION public.archive_activity_event_guard();


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityEvent_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveActivityEvent" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveActivityInclusion ArchiveActivityInclusion_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityInclusion_guard" BEFORE INSERT ON public."ArchiveActivityInclusion" FOR EACH ROW EXECUTE FUNCTION public.archive_activity_inclusion_guard();


--
-- Name: ArchiveActivityInclusion ArchiveActivityInclusion_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveActivityInclusion_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveActivityInclusion" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveAnchorCheck ArchiveAnchorCheck_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveAnchorCheck_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveAnchorCheck" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveAnchor ArchiveAnchor_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveAnchor_guard" BEFORE DELETE OR UPDATE ON public."ArchiveAnchor" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_anchor_guard();


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveCommentVersion_guard" BEFORE INSERT ON public."ArchiveCommentVersion" FOR EACH ROW EXECUTE FUNCTION public.archive_comment_version_guard();


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveCommentVersion_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveCommentVersion" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveComment ArchiveComment_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveComment_guard" BEFORE INSERT OR DELETE OR UPDATE ON public."ArchiveComment" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_comment_guard();


--
-- Name: ArchiveComment ArchiveComment_initial_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveComment_initial_version" AFTER INSERT ON public."ArchiveComment" FOR EACH ROW EXECUTE FUNCTION public.archive_comment_initial_version();


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveDiscussionClosure_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveDiscussionClosure" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveProposalLikeRequest ArchiveProposalLikeRequest_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveProposalLikeRequest_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveProposalLikeRequest" FOR EACH ROW EXECUTE FUNCTION public.participation_credit_history_immutable();


--
-- Name: ArchiveProposalLike ArchiveProposalLike_identity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveProposalLike_identity_guard" BEFORE DELETE OR UPDATE ON public."ArchiveProposalLike" FOR EACH ROW EXECUTE FUNCTION public.archive_participation_identity_guard();


--
-- Name: ArchiveReactionRequest ArchiveReactionRequest_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveReactionRequest_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveReactionRequest" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ArchiveReaction ArchiveReaction_identity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveReaction_identity_guard" BEFORE DELETE OR UPDATE ON public."ArchiveReaction" FOR EACH ROW EXECUTE FUNCTION public.archive_participation_identity_guard();


--
-- Name: ArchiveRevision ArchiveRevision_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ArchiveRevision_immutable" BEFORE DELETE OR UPDATE ON public."ArchiveRevision" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: Community Community_kind_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Community_kind_guard" BEFORE UPDATE ON public."Community" FOR EACH ROW EXECUTE FUNCTION public.workspace_kind_guard();


--
-- Name: CreditAccount CreditAccount_balance_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "CreditAccount_balance_complete" AFTER INSERT OR UPDATE ON public."CreditAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.participation_credit_balance_complete();


--
-- Name: CreditOperation CreditOperation_balance_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "CreditOperation_balance_complete" AFTER INSERT ON public."CreditOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.participation_credit_balance_complete();


--
-- Name: CreditOperation CreditOperation_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "CreditOperation_immutable" BEFORE DELETE OR UPDATE ON public."CreditOperation" FOR EACH ROW EXECUTE FUNCTION public.participation_credit_history_immutable();


--
-- Name: CreditOperation CreditOperation_no_demo_mix; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "CreditOperation_no_demo_mix" BEFORE INSERT ON public."CreditOperation" FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_no_demo_mix();


--
-- Name: CreditOperation CreditOperation_purchase_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "CreditOperation_purchase_complete" AFTER INSERT ON public."CreditOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_complete();


--
-- Name: CreditPaymentReceipt CreditPaymentReceipt_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "CreditPaymentReceipt_complete" AFTER INSERT ON public."CreditPaymentReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_complete();


--
-- Name: CreditPaymentReceipt CreditPaymentReceipt_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "CreditPaymentReceipt_immutable" BEFORE DELETE OR UPDATE ON public."CreditPaymentReceipt" FOR EACH ROW EXECUTE FUNCTION public.participation_credit_history_immutable();


--
-- Name: CreditPurchase CreditPurchase_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "CreditPurchase_complete" AFTER INSERT OR UPDATE ON public."CreditPurchase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_complete();


--
-- Name: CreditPurchase CreditPurchase_no_demo_mix; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "CreditPurchase_no_demo_mix" BEFORE INSERT ON public."CreditPurchase" FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_no_demo_mix();


--
-- Name: CreditPurchase CreditPurchase_quote_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "CreditPurchase_quote_immutable" BEFORE DELETE OR UPDATE ON public."CreditPurchase" FOR EACH ROW EXECUTE FUNCTION public.credit_purchase_quote_immutable();


--
-- Name: PollCommentReactionRequest PollCommentReactionRequest_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "PollCommentReactionRequest_immutable" BEFORE DELETE OR UPDATE ON public."PollCommentReactionRequest" FOR EACH ROW EXECUTE FUNCTION public.participation_credit_history_immutable();


--
-- Name: PollCommentReaction PollCommentReaction_identity_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "PollCommentReaction_identity_immutable" BEFORE UPDATE ON public."PollCommentReaction" FOR EACH ROW EXECUTE FUNCTION public.participation_reaction_identity_immutable();


--
-- Name: Poll Poll_proposal_funding_draft_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Poll_proposal_funding_draft_only" BEFORE UPDATE ON public."Poll" FOR EACH ROW EXECUTE FUNCTION public.proposal_funding_draft_only();


--
-- Name: Poll Poll_proposal_tags_draft_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Poll_proposal_tags_draft_only" BEFORE UPDATE ON public."Poll" FOR EACH ROW EXECUTE FUNCTION public.proposal_topics_draft_only();


--
-- Name: ProposalAbandonment ProposalAbandonment_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalAbandonment_guard" BEFORE INSERT ON public."ProposalAbandonment" FOR EACH ROW EXECUTE FUNCTION public.proposal_abandonment_guard();


--
-- Name: ProposalAbandonment ProposalAbandonment_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalAbandonment_immutable" BEFORE DELETE OR UPDATE ON public."ProposalAbandonment" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ProposalArchive ProposalArchive_committee_scope_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalArchive_committee_scope_guard" BEFORE INSERT OR UPDATE ON public."ProposalArchive" FOR EACH ROW EXECUTE FUNCTION public.proposal_committee_scope_guard();


--
-- Name: ProposalDraftDeletion ProposalDraftDeletion_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalDraftDeletion_immutable" BEFORE DELETE OR UPDATE ON public."ProposalDraftDeletion" FOR EACH ROW EXECUTE FUNCTION public.zvoice_archive_immutable();


--
-- Name: ProposalFundingQuote ProposalFundingQuote_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalFundingQuote_immutable" BEFORE DELETE OR UPDATE ON public."ProposalFundingQuote" FOR EACH ROW EXECUTE FUNCTION public.immutable_funding_quote();


--
-- Name: ProposalSubmission ProposalSubmission_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProposalSubmission_guard" BEFORE INSERT OR DELETE OR UPDATE ON public."ProposalSubmission" FOR EACH ROW EXECUTE FUNCTION public.proposal_submission_guard();


--
-- Name: TreasuryLedgerEntry TreasuryLedgerEntry_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "TreasuryLedgerEntry_immutable" BEFORE DELETE OR UPDATE ON public."TreasuryLedgerEntry" FOR EACH ROW EXECUTE FUNCTION public.community_workspace_journal_immutable();


--
-- Name: TreasuryLedgerEntry TreasuryLedgerEntry_journal_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "TreasuryLedgerEntry_journal_complete" AFTER INSERT ON public."TreasuryLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.community_workspace_journal_complete();


--
-- Name: TreasuryOperation TreasuryOperation_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "TreasuryOperation_immutable" BEFORE DELETE OR UPDATE ON public."TreasuryOperation" FOR EACH ROW EXECUTE FUNCTION public.community_workspace_journal_immutable();


--
-- Name: TreasuryOperation TreasuryOperation_journal_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER "TreasuryOperation_journal_complete" AFTER INSERT ON public."TreasuryOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.community_workspace_journal_complete();


--
-- Name: CommitteeEvent committee_event_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER committee_event_immutable BEFORE DELETE OR UPDATE ON public."CommitteeEvent" FOR EACH ROW EXECUTE FUNCTION public.protect_committee_event();


--
-- Name: CommunityMembership committee_role_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER committee_role_scope BEFORE INSERT OR UPDATE ON public."CommunityMembership" FOR EACH ROW EXECUTE FUNCTION public.restrict_committee_roles();


--
-- Name: ParticipateAutomationJob participate_automation_job_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participate_automation_job_immutable BEFORE DELETE OR UPDATE ON public."ParticipateAutomationJob" FOR EACH ROW EXECUTE FUNCTION public.participate_automation_job_guard();


--
-- Name: ParticipateAutomationLog participate_automation_log_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participate_automation_log_immutable BEFORE DELETE OR UPDATE ON public."ParticipateAutomationLog" FOR EACH ROW EXECUTE FUNCTION public.participate_automation_log_guard();


--
-- Name: ParticipateSourceCheckpoint participate_source_checkpoint_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participate_source_checkpoint_immutable BEFORE DELETE OR UPDATE ON public."ParticipateSourceCheckpoint" FOR EACH ROW EXECUTE FUNCTION public.participate_source_checkpoint_guard();


--
-- Name: PollCollectionCheck protect_poll_collection_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_poll_collection_check BEFORE INSERT OR DELETE OR UPDATE ON public."PollCollectionCheck" FOR EACH ROW EXECUTE FUNCTION public.protect_poll_collection_check();


--
-- Name: SignedDecisionBallot signed_ballot_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signed_ballot_immutable BEFORE DELETE OR UPDATE ON public."SignedDecisionBallot" FOR EACH ROW EXECUTE FUNCTION public.protect_signed_decision_record();


--
-- Name: SignedDecisionRound signed_round_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signed_round_immutable BEFORE DELETE OR UPDATE ON public."SignedDecisionRound" FOR EACH ROW EXECUTE FUNCTION public.protect_signed_decision_record();


--
-- Name: SignedDecisionVoter signed_voter_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signed_voter_immutable BEFORE DELETE OR UPDATE ON public."SignedDecisionVoter" FOR EACH ROW EXECUTE FUNCTION public.protect_signed_decision_record();


--
-- Name: ActivityAutomationJob ActivityAutomationJob_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityAutomationJob"
    ADD CONSTRAINT "ActivityAutomationJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."ArchiveActivityBatch"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityActor ArchiveActivityActor_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityActor"
    ADD CONSTRAINT "ArchiveActivityActor_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityActor ArchiveActivityActor_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityActor"
    ADD CONSTRAINT "ArchiveActivityActor_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityBatch ArchiveActivityBatch_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityBatch"
    ADD CONSTRAINT "ArchiveActivityBatch_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityCheck ArchiveActivityCheck_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityCheck"
    ADD CONSTRAINT "ArchiveActivityCheck_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."ArchiveActivityBatch"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityEvent ArchiveActivityEvent_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityEvent"
    ADD CONSTRAINT "ArchiveActivityEvent_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityInclusion ArchiveActivityInclusion_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityInclusion"
    ADD CONSTRAINT "ArchiveActivityInclusion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."ArchiveActivityBatch"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveActivityInclusion ArchiveActivityInclusion_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveActivityInclusion"
    ADD CONSTRAINT "ArchiveActivityInclusion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."ArchiveActivityEvent"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveAnchorCheck ArchiveAnchorCheck_anchorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveAnchorCheck"
    ADD CONSTRAINT "ArchiveAnchorCheck_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES public."ArchiveAnchor"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ArchiveAnchor ArchiveAnchor_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveAnchor"
    ADD CONSTRAINT "ArchiveAnchor_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."ArchiveRevision"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ArchiveCommentVersion ArchiveCommentVersion_commentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveCommentVersion"
    ADD CONSTRAINT "ArchiveCommentVersion_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES public."ArchiveComment"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveComment ArchiveComment_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ArchiveComment ArchiveComment_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_author_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveComment ArchiveComment_moderator_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_moderator_fkey" FOREIGN KEY ("hiddenById") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveComment ArchiveComment_parent_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveComment"
    ADD CONSTRAINT "ArchiveComment_parent_scope" FOREIGN KEY ("parentId", "archiveId") REFERENCES public."ArchiveComment"(id, "archiveId") ON DELETE RESTRICT;


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveDiscussionClosure"
    ADD CONSTRAINT "ArchiveDiscussionClosure_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveDiscussionClosure ArchiveDiscussionClosure_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveDiscussionClosure"
    ADD CONSTRAINT "ArchiveDiscussionClosure_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."ArchiveRevision"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveProposalLikeRequest ArchiveProposalLikeRequest_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLikeRequest"
    ADD CONSTRAINT "ArchiveProposalLikeRequest_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveProposalLikeRequest ArchiveProposalLikeRequest_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLikeRequest"
    ADD CONSTRAINT "ArchiveProposalLikeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveProposalLike ArchiveProposalLike_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLike"
    ADD CONSTRAINT "ArchiveProposalLike_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveProposalLike ArchiveProposalLike_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveProposalLike"
    ADD CONSTRAINT "ArchiveProposalLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveReactionRequest ArchiveReactionRequest_commentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReactionRequest"
    ADD CONSTRAINT "ArchiveReactionRequest_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES public."ArchiveComment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ArchiveReactionRequest ArchiveReactionRequest_commentId_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReactionRequest"
    ADD CONSTRAINT "ArchiveReactionRequest_commentId_version_fkey" FOREIGN KEY ("commentId", version) REFERENCES public."ArchiveCommentVersion"("commentId", version) ON DELETE RESTRICT;


--
-- Name: ArchiveReactionRequest ArchiveReactionRequest_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReactionRequest"
    ADD CONSTRAINT "ArchiveReactionRequest_user_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveReaction ArchiveReaction_commentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReaction"
    ADD CONSTRAINT "ArchiveReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES public."ArchiveComment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ArchiveReaction ArchiveReaction_commentId_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReaction"
    ADD CONSTRAINT "ArchiveReaction_commentId_version_fkey" FOREIGN KEY ("commentId", version) REFERENCES public."ArchiveCommentVersion"("commentId", version) ON DELETE RESTRICT;


--
-- Name: ArchiveReaction ArchiveReaction_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveReaction"
    ADD CONSTRAINT "ArchiveReaction_user_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ArchiveRevision ArchiveRevision_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArchiveRevision"
    ADD CONSTRAINT "ArchiveRevision_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommitteeEvent CommitteeEvent_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeEvent"
    ADD CONSTRAINT "CommitteeEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommitteeInvitation CommitteeInvitation_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteeInvitation"
    ADD CONSTRAINT "CommitteeInvitation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommitteePolicy CommitteePolicy_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommitteePolicy"
    ADD CONSTRAINT "CommitteePolicy_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunityMembership CommunityMembership_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunityMembership"
    ADD CONSTRAINT "CommunityMembership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunityMembership CommunityMembership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunityMembership"
    ADD CONSTRAINT "CommunityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunityTreasury CommunityTreasury_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunityTreasury"
    ADD CONSTRAINT "CommunityTreasury_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Community Community_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Community"
    ADD CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditAccount CreditAccount_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditAccount"
    ADD CONSTRAINT "CreditAccount_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditAccount CreditAccount_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditAccount"
    ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditOperation CreditOperation_accountId_communityId_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditOperation"
    ADD CONSTRAINT "CreditOperation_accountId_communityId_userId_fkey" FOREIGN KEY ("accountId", "communityId", "userId") REFERENCES public."CreditAccount"(id, "communityId", "userId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditOperation CreditOperation_purchaseId_accountId_communityId_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditOperation"
    ADD CONSTRAINT "CreditOperation_purchaseId_accountId_communityId_userId_fkey" FOREIGN KEY ("purchaseId", "accountId", "communityId", "userId") REFERENCES public."CreditPurchase"(id, "creditAccountId", "communityId", "userId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditPaymentReceipt CreditPaymentReceipt_purchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPaymentReceipt"
    ADD CONSTRAINT "CreditPaymentReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES public."CreditPurchase"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditPurchase CreditPurchase_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPurchase"
    ADD CONSTRAINT "CreditPurchase_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditPurchase CreditPurchase_creditAccountId_communityId_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPurchase"
    ADD CONSTRAINT "CreditPurchase_creditAccountId_communityId_userId_fkey" FOREIGN KEY ("creditAccountId", "communityId", "userId") REFERENCES public."CreditAccount"(id, "communityId", "userId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CreditPurchase CreditPurchase_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CreditPurchase"
    ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMember DaoMember_addedByPollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMember"
    ADD CONSTRAINT "DaoMember_addedByPollId_fkey" FOREIGN KEY ("addedByPollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DaoMember DaoMember_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMember"
    ADD CONSTRAINT "DaoMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMember DaoMember_removedByPollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMember"
    ADD CONSTRAINT "DaoMember_removedByPollId_fkey" FOREIGN KEY ("removedByPollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DaoMember DaoMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMember"
    ADD CONSTRAINT "DaoMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMembershipAction DaoMembershipAction_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipAction"
    ADD CONSTRAINT "DaoMembershipAction_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DaoMembershipAction DaoMembershipAction_requestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipAction"
    ADD CONSTRAINT "DaoMembershipAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public."DaoMembershipRequest"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMembershipAction DaoMembershipAction_targetMemberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipAction"
    ADD CONSTRAINT "DaoMembershipAction_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES public."DaoMember"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DaoMembershipAction DaoMembershipAction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipAction"
    ADD CONSTRAINT "DaoMembershipAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMembershipRequest DaoMembershipRequest_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipRequest"
    ADD CONSTRAINT "DaoMembershipRequest_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMembershipRequest DaoMembershipRequest_reviewedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipRequest"
    ADD CONSTRAINT "DaoMembershipRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DaoMembershipRequest DaoMembershipRequest_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DaoMembershipRequest"
    ADD CONSTRAINT "DaoMembershipRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DiscussionNotification DiscussionNotification_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DiscussionNotification"
    ADD CONSTRAINT "DiscussionNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DiscussionNotification DiscussionNotification_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DiscussionNotification"
    ADD CONSTRAINT "DiscussionNotification_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DiscussionNotification DiscussionNotification_commentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DiscussionNotification"
    ADD CONSTRAINT "DiscussionNotification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES public."ArchiveComment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DiscussionNotification DiscussionNotification_recipientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DiscussionNotification"
    ADD CONSTRAINT "DiscussionNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FundingQuoteThrottle FundingQuoteThrottle_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FundingQuoteThrottle"
    ADD CONSTRAINT "FundingQuoteThrottle_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ParticipateAutomationJob ParticipateAutomationJob_anchorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateAutomationJob"
    ADD CONSTRAINT "ParticipateAutomationJob_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES public."ArchiveAnchor"(id) ON DELETE RESTRICT;


--
-- Name: ParticipateAutomationJob ParticipateAutomationJob_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ParticipateAutomationJob"
    ADD CONSTRAINT "ParticipateAutomationJob_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."ArchiveRevision"(id) ON DELETE RESTRICT;


--
-- Name: Passkey Passkey_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Passkey"
    ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollCollectionCheck PollCollectionCheck_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCollectionCheck"
    ADD CONSTRAINT "PollCollectionCheck_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCollectionCheck PollCollectionCheck_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCollectionCheck"
    ADD CONSTRAINT "PollCollectionCheck_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReactionRequest PollCommentReactionRequest_commentId_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReactionRequest"
    ADD CONSTRAINT "PollCommentReactionRequest_commentId_pollId_fkey" FOREIGN KEY ("commentId", "pollId") REFERENCES public."PollComment"(id, "pollId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReactionRequest PollCommentReactionRequest_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReactionRequest"
    ADD CONSTRAINT "PollCommentReactionRequest_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReaction PollCommentReaction_authorPollVoterAccessId_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReaction"
    ADD CONSTRAINT "PollCommentReaction_authorPollVoterAccessId_pollId_fkey" FOREIGN KEY ("authorPollVoterAccessId", "pollId") REFERENCES public."PollVoterAccess"(id, "pollId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReaction PollCommentReaction_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReaction"
    ADD CONSTRAINT "PollCommentReaction_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReaction PollCommentReaction_commentId_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReaction"
    ADD CONSTRAINT "PollCommentReaction_commentId_pollId_fkey" FOREIGN KEY ("commentId", "pollId") REFERENCES public."PollComment"(id, "pollId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollCommentReaction PollCommentReaction_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollCommentReaction"
    ADD CONSTRAINT "PollCommentReaction_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollComment PollComment_authorPollVoterAccessId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_authorPollVoterAccessId_fkey" FOREIGN KEY ("authorPollVoterAccessId") REFERENCES public."PollVoterAccess"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollComment PollComment_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollComment PollComment_hiddenByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_hiddenByUserId_fkey" FOREIGN KEY ("hiddenByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollComment PollComment_parentId_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_parentId_pollId_fkey" FOREIGN KEY ("parentId", "pollId") REFERENCES public."PollComment"(id, "pollId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PollComment PollComment_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollComment"
    ADD CONSTRAINT "PollComment_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollEligibility PollEligibility_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollEligibility"
    ADD CONSTRAINT "PollEligibility_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollEligibility PollEligibility_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollEligibility"
    ADD CONSTRAINT "PollEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollInvite PollInvite_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollInvite"
    ADD CONSTRAINT "PollInvite_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollInvite PollInvite_pollVoterAccessId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollInvite"
    ADD CONSTRAINT "PollInvite_pollVoterAccessId_fkey" FOREIGN KEY ("pollVoterAccessId") REFERENCES public."PollVoterAccess"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollInvite PollInvite_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollInvite"
    ADD CONSTRAINT "PollInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollTally PollTally_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollTally"
    ADD CONSTRAINT "PollTally_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PollVoterAccess PollVoterAccess_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PollVoterAccess"
    ADD CONSTRAINT "PollVoterAccess_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Poll Poll_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Poll"
    ADD CONSTRAINT "Poll_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Poll Poll_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Poll"
    ADD CONSTRAINT "Poll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Poll Poll_treasuryId_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Poll"
    ADD CONSTRAINT "Poll_treasuryId_communityId_fkey" FOREIGN KEY ("treasuryId", "communityId") REFERENCES public."CommunityTreasury"(id, "communityId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalAbandonment ProposalAbandonment_archiveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES public."ProposalArchive"(id) ON DELETE RESTRICT;


--
-- Name: ProposalAbandonment ProposalAbandonment_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."ArchiveActivityEvent"(id) ON DELETE RESTRICT;


--
-- Name: ProposalAbandonment ProposalAbandonment_submissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalAbandonment"
    ADD CONSTRAINT "ProposalAbandonment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES public."ProposalSubmission"(id) ON DELETE RESTRICT;


--
-- Name: ProposalArchive ProposalArchive_committeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalArchive"
    ADD CONSTRAINT "ProposalArchive_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalArchive ProposalArchive_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalArchive"
    ADD CONSTRAINT "ProposalArchive_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalFundingQuote ProposalFundingQuote_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalFundingQuote"
    ADD CONSTRAINT "ProposalFundingQuote_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalFundingQuote ProposalFundingQuote_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalFundingQuote"
    ADD CONSTRAINT "ProposalFundingQuote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalSubmission ProposalSubmission_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalSubmission"
    ADD CONSTRAINT "ProposalSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: ProposalSubmission ProposalSubmission_committeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalSubmission"
    ADD CONSTRAINT "ProposalSubmission_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES public."Community"(id) ON DELETE RESTRICT;


--
-- Name: ProposalSubmission ProposalSubmission_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalSubmission"
    ADD CONSTRAINT "ProposalSubmission_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON DELETE RESTRICT;


--
-- Name: PublicAuditEvent PublicAuditEvent_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicAuditEvent"
    ADD CONSTRAINT "PublicAuditEvent_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SignedDecisionBallot SignedDecisionBallot_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionBallot"
    ADD CONSTRAINT "SignedDecisionBallot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."SignedDecisionRound"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignedDecisionBallot SignedDecisionBallot_voterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionBallot"
    ADD CONSTRAINT "SignedDecisionBallot_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES public."SignedDecisionVoter"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignedDecisionChallenge SignedDecisionChallenge_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionChallenge"
    ADD CONSTRAINT "SignedDecisionChallenge_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."SignedDecisionRound"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignedDecisionRound SignedDecisionRound_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionRound"
    ADD CONSTRAINT "SignedDecisionRound_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."ArchiveRevision"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignedDecisionVoter SignedDecisionVoter_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignedDecisionVoter"
    ADD CONSTRAINT "SignedDecisionVoter_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."SignedDecisionRound"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TicketAssignment TicketAssignment_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TicketAssignment TicketAssignment_pollVoterAccessId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_pollVoterAccessId_fkey" FOREIGN KEY ("pollVoterAccessId") REFERENCES public."PollVoterAccess"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TicketAssignment TicketAssignment_ticketId_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_ticketId_pollId_fkey" FOREIGN KEY ("ticketId", "pollId") REFERENCES public."VoteTicket"(id, "pollId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TicketAssignment TicketAssignment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TreasuryLedgerEntry TreasuryLedgerEntry_operationId_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryLedgerEntry"
    ADD CONSTRAINT "TreasuryLedgerEntry_operationId_communityId_fkey" FOREIGN KEY ("operationId", "communityId") REFERENCES public."TreasuryOperation"(id, "communityId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TreasuryLedgerEntry TreasuryLedgerEntry_treasuryId_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryLedgerEntry"
    ADD CONSTRAINT "TreasuryLedgerEntry_treasuryId_communityId_fkey" FOREIGN KEY ("treasuryId", "communityId") REFERENCES public."CommunityTreasury"(id, "communityId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TreasuryOperation TreasuryOperation_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryOperation"
    ADD CONSTRAINT "TreasuryOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TreasuryOperation TreasuryOperation_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryOperation"
    ADD CONSTRAINT "TreasuryOperation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES public."Community"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TreasuryOperation TreasuryOperation_destinationTreasuryId_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryOperation"
    ADD CONSTRAINT "TreasuryOperation_destinationTreasuryId_communityId_fkey" FOREIGN KEY ("destinationTreasuryId", "communityId") REFERENCES public."CommunityTreasury"(id, "communityId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TreasuryOperation TreasuryOperation_sourceTreasuryId_communityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TreasuryOperation"
    ADD CONSTRAINT "TreasuryOperation_sourceTreasuryId_communityId_fkey" FOREIGN KEY ("sourceTreasuryId", "communityId") REFERENCES public."CommunityTreasury"(id, "communityId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VoteReceipt VoteReceipt_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteReceipt"
    ADD CONSTRAINT "VoteReceipt_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VoteRequest VoteRequest_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteRequest"
    ADD CONSTRAINT "VoteRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."VoteTicket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VoteTicket VoteTicket_pollId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VoteTicket"
    ADD CONSTRAINT "VoteTicket_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES public."Poll"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict afolPhoHJjInQI2ugiT4AELhRn5gtXT8x8kMtjjzkpHILkXEyktBeDUf3lApG0K
