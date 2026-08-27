# Adapters

House rule: external services are reached only through an adapter module in
this folder. An adapter exports a **typed interface**; core code imports the
interface, never the vendor SDK. Each adapter ships with a **fake
implementation** for tests, so nothing in the test suite touches a real
third-party service.

Live now:

- `storage/` — Cloudflare R2 (S3-compatible), presigned direct uploads (KS-04)
- `email/` — Resend via REST (KS-04)

Coming in later prompts:

- AssemblyAI
- Anthropic
- Gmail
- Stripe/Square
- e-signature
