# Remaining acceptance

The [implementation scope](implementation-status.md) distinguishes delivered
source from unfinished product and deployment work.

Before hosting: set independent secrets and HTTPS origins, install the full
SQL baseline, import only intended public records, configure email delivery,
and verify backup/restore, browser sessions, passkeys and monitoring.

Before financial activation: review isolated wallet policy, exact transaction
verification, replay/reorganization handling, fee reservation/capture and
failure/refund paths with controlled funds and explicit operator authorization.

Before binding DAO governance: finish cutoff-aware verified finalization,
shared result-publication rules, stable identity/membership policy, ZcashNames
control verification and the budget/payment lifecycle. Existing closure guards
must remain in place until these guarantees are implemented and reviewed.

Before committee activation: authorize the first owner, verify personal
membership and signing keys, test the final origin, and define how decision
receipts are retained and independently verified. Public source access does not
grant committee authority.
