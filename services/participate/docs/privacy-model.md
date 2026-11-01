# Privacy Model

Reviewed 9 October 2026. Public proposal access does not grant private discussion or ballot access. This document describes current protection boundaries; it does not certify anonymous voting against the operator.

## What the system protects well

### Public observers
- do not see the selected option by voter
- do not see a public mapping of voter identity to receipt
- can see published proposal content and aggregate voting information on the public board

### Admin UI operators
- can see who completed voting
- cannot see which answer a completed voter selected from the normal admin interface

### Chain observers
- vote transport uses shielded transfers rather than transparent addresses

## What the system does not fully solve yet

- a privileged operator with app, database, and collector access can still correlate more than a public observer
- eligibility is still invite-based and identity-aware
- this is not yet a membership-proof system
- this is not yet a trustless tally system
- publication rules are not unified: the public poll board shows aggregate OPEN results while other result paths wait until closing; small-group inference risk requires a frozen policy across pages, APIs, feeds and exports

## Current positioning

This project should be described as:

**shielded voting for community pilots**

It should not yet be described as:

**fully trustless anonymous voting against a privileged operator**

## v2 direction

The [DAO roadmap](./roadmap.md) now governs sequencing. Closing/finalization correctness and stable membership come before claiming binding governance readiness.

The next privacy-hardening path is:
- identity layer separated from vote core
- pseudonymous subject references
- encrypted sensitive mappings
- stronger collector isolation
- later, membership-proof eligibility
