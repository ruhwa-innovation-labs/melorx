# Security policy

## Supported versions

| Version | Status |
|---|---|
| `0.3.x` | Active — security patches land on `main` and ship in the next release |
| `0.2.x` and earlier | Unsupported — please upgrade |

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.** Use one of
the private channels below so the maintainers can coordinate a fix before the
issue becomes public.

### Preferred: GitHub Private Vulnerability Reporting

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Fill in the form with reproduction steps, affected versions, and any
   proof-of-concept code or queries.

This opens a private advisory visible only to the maintainers and you. We can
discuss the fix, publish a CVE, and coordinate disclosure from there.

### Fallback: email

If GitHub Private Vulnerability Reporting is unavailable, email the maintainers
at **security@ruhwa-innovation-labs.org**. Please include:

- A description of the vulnerability.
- Steps to reproduce (or a proof-of-concept repo / curl invocation).
- The melorx version(s) you verified it against.
- Whether the issue affects the hosted demo, self-hosted deployments, or only
  the `@melorx/client` npm package.

We acknowledge reports within **72 hours** and aim to ship a fix within
**30 days** for high/critical severity issues, longer for lower-severity
findings.

## Scope

The following are **in scope** for vulnerability reports:

- melorx API runtime (`packages/api`) — authentication, authorisation,
  injection, crash-inducing inputs.
- `@melorx/client` npm package — supply-chain, prototype pollution,
  unexpected network egress.
- `@melorx/cli` — privilege escalation, arbitrary file write via
  crafted input, credential leakage.
- Docker image (`ghcr.io/ruhwa-innovation-labs/melorx`) — base-image CVEs
  not yet addressed, unnecessary capabilities, secrets baked into the image.
- GitHub Actions workflows — secret leakage, untrusted-input injection.

The following are **out of scope** unless they affect the runtime above:

- Vulnerabilities in third-party services (OpenFDA, RxNorm) that melorx
  queries — report those to the upstream operator.
- Denial-of-service via legitimate traffic volumes against a self-hosted
  instance — operators are responsible for rate limiting and scaling.
- Data accuracy concerns (missing or incorrect drug-drug interactions) —
  open a normal issue with a source citation; the PR template is the
  right path.
- Clinical-decision-system criticism — melorx is positioned as an
  **informational reference tool**, never as a clinical decision system.
  See `docs/project.md` for the disclaimer architecture.

## Disclosure policy

Once a fix ships we publish a GitHub Security Advisory with:

- A short description of the issue.
- The CVE identifier (when applicable).
- The fixed version(s).
- Credit to the reporter, unless they request anonymity.

Thank you for helping keep melorx and its downstream users safe.
