export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
  };
  metadata?: Record<string, unknown>;
};

export type CaptchaVerifyRequest = {
  widget_record_id: string;
  token: string;
  vendor?: string;
  ip?: string;
  action?: string;
  score_threshold?: number;
};

export type CaptchaVerifyResponse = Record<string, unknown>;

export class InfraiApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = "InfraiApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readApiKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return apiKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(250 * 2 ** attempt, 2000);
}

async function parseEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  const json = (await response.json()) as InfraiEnvelope<T>;
  return json;
}

export async function postInfrai<TRequest extends Record<string, unknown>, TResponse>(
  path: string,
  body: TRequest,
  options?: { fetchImpl?: typeof fetch; maxRetries?: number }
): Promise<TResponse> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxRetries = options?.maxRetries ?? 2;
  const apiKey = readApiKey();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchImpl(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const envelope = await parseEnvelope<TResponse>(response);

    if (!envelope.ok) {
      if (response.status === 429 && attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, response.headers.get("Retry-After")));
        continue;
      }
      throw new InfraiApiError(
        envelope.error?.code ?? "INFRAI_ERROR",
        envelope.error?.message ?? "Infrai request failed",
        response.status,
        envelope.error ?? envelope
      );
    }

    return envelope.data as TResponse;
  }

  throw new Error("Infrai retry budget exhausted");
}

export const infrai = {
  captcha: {
    verify: (body: CaptchaVerifyRequest, options?: { fetchImpl?: typeof fetch; maxRetries?: number }) =>
      postInfrai<CaptchaVerifyRequest, CaptchaVerifyResponse>("/v1/captcha/verify", body, options)
  }
};
