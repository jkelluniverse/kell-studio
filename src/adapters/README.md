# Adapters

House rule: external services are reached only through an adapter module in
this folder. An adapter exports a **typed interface**; core code imports the
interface, never the vendor SDK. Each adapter ships with a **fake
implementation** for tests, so nothing in the test suite touches a real
third-party service.

No adapters exist yet. Coming in later prompts:

- AssemblyAI
- Anthropic
- Gmail
- Resend
- Stripe/Square
- e-signature
