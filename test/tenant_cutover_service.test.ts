import { describe, expect, it } from "vitest";
import { TenantCutoverService } from "../src/tenant_cutover_service";

describe("TenantCutoverService", () => {
  it("returns revoke_existing_sessions for an admin revocation request with a passing captcha", async () => {
    const service = new TenantCutoverService(async (input) => {
      expect(input.widget_record_id).toBe("signup-widget-record");
      return { verified: true };
    });

    const result = await service.reviewTenantCutover({
      tenantSlug: "acme-eu",
      companyName: "Acme EU",
      adminEmail: "owner@acme.example",
      adminName: "Mina Cole",
      widgetRecordId: "signup-widget-record",
      captchaToken: "revocation-captcha-token",
      sourceStack: "keycloak",
      requestIp: "198.51.100.77",
      cutoverId: "cutover-acme-eu-revoke-01",
      operation: "admin_revoke_sessions"
    });

    expect(result.decision).toBe("revoke_existing_sessions");
    expect(result.nextStep).toContain("Invalidate all incumbent sessions");
  });

  it("returns manual_review when captcha does not pass", async () => {
    const service = new TenantCutoverService(async () => ({ verified: false }));

    const result = await service.reviewTenantCutover({
      tenantSlug: "acme-eu",
      companyName: "Acme EU",
      adminEmail: "owner@acme.example",
      adminName: "Mina Cole",
      widgetRecordId: "signup-widget-record",
      captchaToken: "signup-captcha-token",
      sourceStack: "auth0",
      requestIp: "198.51.100.24",
      cutoverId: "cutover-acme-eu-2026-09-10",
      operation: "onboard_tenant"
    });

    expect(result.decision).toBe("manual_review");
  });
});
