# Plans

One markdown file per multi-commit feature or larger redesign. The aim is to capture *intent + design + open questions* before the work starts so the implementer (Kit, an agent, or a contributor) can pick it up cold.

## Format

Each plan should cover:

- **Why** — the user-facing problem or feature gap it addresses.
- **What we'd ship** — bullet-level description of the user-visible end state.
- **API / architecture mapping** — concrete endpoints, services, atoms, types.
- **Open questions** — design choices that aren't decided yet.
- **Out of scope (for v1)** — what we're explicitly *not* doing first time round.
- **Status** — `Not started` / `In progress` / `Shipped — see <commit/PR>`.

When a plan ships, leave the file in place and update the **Status** line so we can read the history.

## Index

- [`queued-reviews.md`](./queued-reviews.md) — pending diff-comment reviews and the submit/discard flow.
- [`edit-delete-comments.md`](./edit-delete-comments.md) — edit your own comments in place, delete with confirm.
