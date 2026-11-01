-- Additive rate-limit lookup index after participation credits. Safe to rerun.
BEGIN;
CREATE INDEX IF NOT EXISTS "PollCommentReactionRequest_pollId_actorKey_createdAt_idx"
  ON "PollCommentReactionRequest" ("pollId", "actorKey", "createdAt");
COMMIT;
