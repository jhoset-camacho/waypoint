import { corsHeaders } from "./cors.ts";

interface SuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  stub?: boolean;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export function success<T>(data?: T, extra?: Record<string, unknown>): Response {
  const body: SuccessResponse<T> = { ok: true, ...extra };
  if (data !== undefined) body.data = data;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function error(message: string, status = 400): Response {
  const body: ErrorResponse = { ok: false, error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function optionsCors(): Response {
  return new Response("ok", { headers: corsHeaders });
}
