# First-Principles Review Remediation

This change set intentionally addresses the highest-risk findings before adding
more features.

## Enforced now

- The mandatory build workflow runs unit tests, lint, typecheck, and a production
  build instead of relying on a one-off local benchmark.
- CI fails when the production build mutates tracked files.
- Scheduled translation no longer writes directly to the default branch. It
  generates from a specific default-branch revision, validates the staged
  transaction, and creates or updates a dedicated pull request.
- Translation APPLY runs fail visibly when the provider secret is absent.
- Production AI endpoints fail closed when the distributed rate limiter is not
  configured; local development remains zero-config.
- The public classification endpoint has a bounded request body and title size,
  and records structured outcomes without changing its graceful user-facing
  fallback.
- Translation-provider requests now have a finite timeout and a lower bounded
  output-token ceiling.

## Deliberately deferred

AST-based MDX translation, policy-versioned translation memory, stable anchor
identity, duplicate-docId migration, static historical redirects, and product
outcome evaluation remain separate changes. Combining those schema and
architecture migrations with the safety-floor patch would recreate the same
large rollback boundary criticised in the review.
