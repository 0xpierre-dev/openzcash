# Comment history and automatic activity batches

13 October 2026 · Production release evidence

## Behavior

- Authors can edit their own active comments. Each edit appends immutable text, its hash, the previous version hash and its timestamp. Old versions remain available through **View history**.
- Likes belong to the version they endorsed. An edit starts a new version with no inherited likes. Normal demo-credit pricing applies to the first like on that version; retries and re-likes do not charge twice. Editing and withdrawal are free.
- Withdrawal leaves a marker in the conversation and preserves replies. Following the user's clarification, the original text remains publicly readable in history and historical receipts. The current-version label becomes **Withdrawn**, not **Current**. This does not restore the comment to the active conversation.
- Moderator hiding is separate: it suppresses text from every public version, receipt and export. The original hashes and audit events remain. Previously downloaded copies cannot be recalled.
- An observed official-source verdict creates an immutable discussion snapshot. It records the source timestamp separately from the observation/closure timestamp, current versions, version hashes, likes and the event-chain head. Later interactions create later events and cannot change that snapshot. The deferred committee workflow is unaffected.
- Activity is automatically collected into bounded Ironwood batches across eligible production records, with one Merkle inclusion path per event. The chain records the commitment; retained receipts and backups are still needed to recover text.

## Interface

Like and Reply remain visible. Author-only Edit and Withdraw live in a compact three-dot menu, with keyboard focus, Escape and click-away support. Editing focuses the text field; retries preserve the draft and request ID. Withdrawal has an inline explanation and a separate confirmation action. History loads on demand. Mobile editing uses a readable 16-pixel field and correctly aligned controls.
