BEGIN;
CREATE TABLE "SignedDecisionRound" (
  "id" TEXT PRIMARY KEY, "revisionId" TEXT NOT NULL UNIQUE REFERENCES "ArchiveRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scopeId" TEXT NOT NULL, "manifestJson" TEXT NOT NULL, "manifestHash" TEXT NOT NULL UNIQUE,
  "closesAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SignedDecisionVoter" (
  "id" TEXT PRIMARY KEY, "roundId" TEXT NOT NULL REFERENCES "SignedDecisionRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL, "keyIds" TEXT[] NOT NULL,
  UNIQUE ("roundId", "userId")
);
CREATE TABLE "SignedDecisionBallot" (
  "id" TEXT PRIMARY KEY, "roundId" TEXT NOT NULL REFERENCES "SignedDecisionRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "voterId" TEXT NOT NULL UNIQUE REFERENCES "SignedDecisionVoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ballotJson" TEXT NOT NULL, "ballotHash" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SignedDecisionBallot_roundId_idx" ON "SignedDecisionBallot"("roundId");
CREATE TABLE "SignedDecisionChallenge" (
  "id" TEXT PRIMARY KEY, "roundId" TEXT NOT NULL REFERENCES "SignedDecisionRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL, "envelope" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("roundId", "userId")
);
CREATE INDEX "SignedDecisionChallenge_expiresAt_idx" ON "SignedDecisionChallenge"("expiresAt");
CREATE FUNCTION protect_signed_decision_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Signed decision records are append-only'; END;
$$;
CREATE TRIGGER signed_round_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionRound" FOR EACH ROW EXECUTE FUNCTION protect_signed_decision_record();
CREATE TRIGGER signed_voter_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionVoter" FOR EACH ROW EXECUTE FUNCTION protect_signed_decision_record();
CREATE TRIGGER signed_ballot_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionBallot" FOR EACH ROW EXECUTE FUNCTION protect_signed_decision_record();
COMMIT;
