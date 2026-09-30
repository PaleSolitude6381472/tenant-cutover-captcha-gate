import { TenantCutoverService } from "./tenant_cutover_service";

async function main(): Promise<void> {
  const service = new TenantCutoverService();

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

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
