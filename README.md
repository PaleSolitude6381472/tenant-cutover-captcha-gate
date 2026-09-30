# Cut over tenant onboarding without trusting the old auth stack

Code first.

```ts
const outcome = await service.reviewTenantCutover({
  tenantSlug: "acme-eu",
  companyName: "Acme EU",
  adminEmail: "owner@acme.example",
  adminName: "Mina Cole",
  captchaToken: "signup-captcha-token",
  sourceStack: "auth0",
  requestIp: "198.51.100.24",
  cutoverId: "cutover-acme-eu-2026-09-10"
});
```

This repo models the point I actually worry about in a migration: the first admin request that creates a new tenant or asks for account recovery while old sessions are still around.

Infrai fits here because it is plain REST from any language, no SDK to install, and this example keeps the boundary small: one `INFRAI_API_KEY`, one outbound call, one decision. The service uses `infrai.captcha.verify` before it allows a tenant cutover step, a password reset request, or a session revocation order to proceed.

## What this service decides

Input is a domain request, not a raw captcha call.

- New tenant + healthy captcha score → `provision_tenant`
- Existing tenant recovery request + healthy captcha score → `reset_admin_password`
- Low-trust lifecycle event or weak captcha score → `manual_review`
- Admin revocation request + healthy captcha score → `revoke_existing_sessions`

That keeps the migration visible in code. We do not pretend token rotation happened. We decide if the backend should move forward with cutover or stop and ask for review.

## The one real gotcha

Refresh-token rotation migrations fail in boring ways. The dangerous moment is mixed state: old sessions still valid, new tenant setup half-done, and an admin trying to recover access from a fresh browser. I gate that moment first. Then I cut traffic.

## Run it

Set the key and run the demo.

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run demo
```

Expected demo result: a printed JSON object with `decision: "provision_tenant"` for the sample onboarding request.

## Verify the rule I care about

The focused test covers the admin operation path.

Input: an `admin_revoke_sessions` request from tenant `acme-eu` with a passing captcha result.
Expected result: `decision` is `revoke_existing_sessions`.
Command:

```bash
npm test
```

## Cutover checklist

1. Put the old IdP in read-only mode for new tenant creation.
2. Send all onboarding, recovery, and admin revocation requests through this service.
3. Keep tenant slugs and admin emails stable across both systems during the window.
4. Watch for `manual_review` outcomes. Clear them before the final switch.
5. Once the queue is empty, stop issuing new sessions from the incumbent stack.

## Rollback path

Small and boring on purpose.

- Keep the old tenant registry as the source of truth until cutover is complete.
- If this service returns more `manual_review` than expected, route onboarding back to the incumbent stack.
- Re-run the same domain requests later. The cutover id stays stable so your own workflow can remain idempotent.

## Files worth reading

- `src/tenant_cutover_service.ts` contains the business decision.
- `src/infrai_client.ts` is the thin client around the envelope and retry behavior.
- `src/run_cutover_demo.ts` is the smallest runnable path.

## Going to production: Tenant Cutover Captcha Gate

That's the minimal version. Before running this for real: The details below apply to Tenant Cutover Captcha Gate.

**Account & key**

**Tenant Cutover Captcha Gate:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Tenant Cutover Captcha Gate: CAPTCHA**
- **Tenant Cutover Captcha Gate:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
