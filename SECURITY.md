# Security

This distribution includes experimental privacy and governance components.
The supported source is the current default branch; older snapshots may retain
known issues. Review the [installation guide](docs/local-development.md),
[Participate scope](services/participate/docs/implementation-status.md), and
[Private Chat trust boundaries](services/private-chat/README.md) before hosting.

## Reporting

Use GitHub private vulnerability reporting if it is enabled on the repository.
If it is unavailable, ask a maintainer through their published profile for a
private reporting channel before sharing sensitive details. Do not open a
public issue containing credentials, personal data or an unmitigated exploit.
Include the affected commit, component, reproducible steps and expected impact.
Do not test against hosted services or other users without authorization.

## Hosting boundary

Keep application and provider secrets outside Git. Use distinct credentials
for each service, explicit origins, least-privilege database accounts and
restricted network access. Public source access does not grant authority to
activate committee operations, paid credits or wallet signing.

The release audit records the checks actually performed. Automated tests and
dependency scans are not an independent cryptographic audit, a penetration
test of the hosted infrastructure or a promise that software has no defects.
