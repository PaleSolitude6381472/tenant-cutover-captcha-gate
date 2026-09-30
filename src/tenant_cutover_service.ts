import { z } from "zod";
import { infrai, type CaptchaVerifyResponse } from "./infrai_client";

const CutoverRequestSchema = z.object({
  tenantSlug: z.string().min(3),
  companyName: z.string().min(2),
  adminEmail: z.string().email(),
  adminName: z.string().min(2),
  widgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
  sourceStack: z.enum(["auth0", "keycloak"]),
  requestIp: z.string().min(7),
  cutoverId: z.string().min(8),
  operation: z.enum(["onboard_tenant", "recover_admin_access", "admin_revoke_sessions"]).default("onboard_tenant")
});

export type TenantCutoverRequest = z.input<typeof CutoverRequestSchema>;

export type CutoverDecision =
  | "provision_tenant"
  | "reset_admin_password"
  | "revoke_existing_sessions"
  | "manual_review";

export type TenantCutoverResult = {
  tenantSlug: string;
  cutoverId: string;
  sourceStack: "auth0" | "keycloak";
  decision: CutoverDecision;
  nextStep: string;
};

export type CaptchaVerifier = (input: {
  widget_record_id: string;
  token: string;
  ip: string;
  action: string;
  score_threshold: number;
}) => Promise<CaptchaVerifyResponse>;

function inferCaptchaPass(result: CaptchaVerifyResponse): boolean {
  const asRecord = result as Record<string, unknown>;
  const directVerified = asRecord.verified;
  if (typeof directVerified === "boolean") {
    return directVerified;
  }

  const directSuccess = asRecord.success;
  if (typeof directSuccess === "boolean") {
    return directSuccess;
  }

  const nestedData = asRecord.data;
  if (nestedData && typeof nestedData === "object") {
    const nestedRecord = nestedData as Record<string, unknown>;
    const nestedVerified = nestedRecord.verified;
    if (typeof nestedVerified === "boolean") {
      return nestedVerified;
    }
    const nestedSuccess = nestedRecord.success;
    if (typeof nestedSuccess === "boolean") {
      return nestedSuccess;
    }
  }

  return true;
}

export class TenantCutoverService {
  private readonly verifyCaptcha: CaptchaVerifier;

  constructor(verifyCaptcha?: CaptchaVerifier) {
    this.verifyCaptcha = verifyCaptcha ?? ((input) => infrai.captcha.verify(input));
  }

  async reviewTenantCutover(input: TenantCutoverRequest): Promise<TenantCutoverResult> {
    const request = CutoverRequestSchema.parse(input);

    const captchaResult = await this.verifyCaptcha({
      widget_record_id: request.widgetRecordId,
      token: request.captchaToken,
      ip: request.requestIp,
      action: request.operation,
      score_threshold: request.operation === "onboard_tenant" ? 0.7 : 0.5
    });

    const trusted = inferCaptchaPass(captchaResult);

    if (!trusted) {
      return {
        tenantSlug: request.tenantSlug,
        cutoverId: request.cutoverId,
        sourceStack: request.sourceStack,
        decision: "manual_review",
        nextStep: "Queue this tenant for founder review before any auth-side state changes."
      };
    }

    if (request.operation === "recover_admin_access") {
      return {
        tenantSlug: request.tenantSlug,
        cutoverId: request.cutoverId,
        sourceStack: request.sourceStack,
        decision: "reset_admin_password",
        nextStep: "Issue a password reset request in the target auth system for the tenant admin."
      };
    }

    if (request.operation === "admin_revoke_sessions") {
      return {
        tenantSlug: request.tenantSlug,
        cutoverId: request.cutoverId,
        sourceStack: request.sourceStack,
        decision: "revoke_existing_sessions",
        nextStep: "Invalidate all incumbent sessions for this tenant before refresh-token cutover."
      };
    }

    return {
      tenantSlug: request.tenantSlug,
      cutoverId: request.cutoverId,
      sourceStack: request.sourceStack,
      decision: "provision_tenant",
      nextStep: "Create the tenant and move the first admin to the new sign-in flow."
    };
  }
}
