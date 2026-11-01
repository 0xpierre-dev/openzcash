# Isolated committee practice

The practice flow lets a signed-in tester rehearse a committee review with four
clearly identified test seats. It can resume an unfinished practice review,
generate test-seat ballots and reset the tester's practice activity. These are
demonstration records, not decisions or signatures by real committee members.

Use a separate portal, Participate backend and disposable database. Do not enable
this mode on a live community or copy production accounts, passkeys or secrets.
The ordinary [local setup](../README.md) does not create the practice environment.

## Prepare test data

Create a database named `participate_demo` or `participate_demo_<suffix>`, where
the suffix contains only lowercase letters, digits or underscores (at most 40
characters). Apply the [fresh database baseline](database.md) and create your
own owner/community. Populate public or synthetic proposal archive records for
that host, all referencing exactly one test committee. Record the host's
`PARTICIPATE_COMMUNITY_ID`.

The SQL setup below requires those archive and committee records; it refuses an
empty host or ambiguous committee. It does not import the hosted site's history.
Run it from this service directory, with the URL and host ID of that disposable
database:

```sh
psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v host="$PARTICIPATE_COMMUNITY_ID" \
  -f scripts/demo/participate-demo.sql
```

This creates the database marker, four test seats and the practice-only reset
rules. Its database-name guard runs before changes. The script disables ordinary
active memberships in the selected test committee, which is another reason to
use a disposable database. Never substitute a production database URL.

## Configure the two applications

Set `PARTICIPATE_DEMO_ENVIRONMENT=true` on both the dedicated portal and backend.
The portal restricts navigation to Participate, its required APIs and assets;
`/api` remains available for health checks.

The backend additionally requires:

- `PARTICIPATE_COMMITTEE_ENABLED=true` and `PARTICIPATE_PUBLIC_DEMO=false`.
- `DATABASE_URL` pointing to the marked practice database.
- `PARTICIPATE_COMMUNITY_ID` matching the prepared host.
- `APP_BASE_URL`, `PASSKEY_ORIGIN` and `PARTICIPATE_PARENT_ORIGIN` matching the
  dedicated portal origin, never `openzcash.org` or `www.openzcash.org`.
- Fresh session/email secrets and your own verified email provider for sign-in.

Leave `PARTICIPATE_AUTOMATION_CONFIG`, `ARCHIVE_WRITER_RPC_URL` and
`ZALLET_RPC_URL` unset, and keep `ARCHIVE_TESTNET_SIGNING_ENABLED=false`.
The environment refuses practice actions when wallet/automation writers are
configured. Real credit purchases must remain disabled. An optional
`PARTICIPATE_DEMO_ALLOWED_EMAILS` limits testers by email or `@domain`; an empty
list permits any eligible verified email account.

## Verify

Open `/zcg/participate?view=practice`, sign in with a test account you control,
start a practice review, reload to verify resume, inspect the test-seat labels
and reset only your own practice activity. A user without a committee seat must
still be able to sign out.

The service checks the opt-in flag, origin/writer configuration, actual database
name and marker row before allowing practice actions. Its database regression
suite uses `PARTICIPATE_DEMO_TEST_DATABASE_URL` separately from the ordinary
treasury suites. Run it only against a disposable database prepared as above.

The public free pilot (`PARTICIPATE_PUBLIC_DEMO`) is a different mode. It does not
grant a committee seat or enable practice resets.
