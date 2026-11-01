# Database setup

For a **new empty database**, set `DATABASE_URL` in `.env`, install dependencies,
and run with PostgreSQL's `psql` client available:

```sh
npm ci
npm run db:setup
```

This installs `prisma/baseline.sql` in one transaction. It refuses a database
that already contains public tables. The baseline contains tables, indexes,
foreign keys, checks and triggers, including the integrity rules that Prisma
schema push alone cannot express. It contains no accounts, passwords, proposal
records, balances or production data. Seed your own owner with `npm run db:seed`.

The baseline was reconstructed by applying the historical SQL upgrades to a
fresh base schema. It preserves SQL-only relationships and immutability rules
that do not appear in Prisma's model. Do not use `prisma db push` to remove those
constraints or to upgrade a populated installation.

For **existing databases**, back up and restore-test first. Identify already
applied migrations, inspect the relevant `prisma/upgrades` files and their
dependencies, then apply only missing upgrades during a controlled release.
Filenames with the same date are not a guaranteed execution order: for example,
submissions precede lifecycle, signed decisions precede untimed reviews, and
nested replies precede comment versions (the latter replaces the shared guard).
Never run the fresh baseline over an existing database.
