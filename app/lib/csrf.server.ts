import { timingSafeEqual } from "node:crypto";

import { getEnv } from "~/config/env.server";
import { getSessionRecord } from "~/lib/auth/session.server";

export async function requireValidCsrf(request: Request, formData: FormData) {
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const appOrigin = getEnv().APP_ORIGIN;
  if (origin) {
    if (origin !== appOrigin)
      throw new Response(
        JSON.stringify({
          message: `Invalid request origin: expected ${appOrigin}, got ${origin}`,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
  } else if (referer) {
    if (!referer.startsWith(`${appOrigin}/`) && referer !== appOrigin)
      throw new Response(
        JSON.stringify({ message: "Invalid request referer" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
  } else {
    throw new Response(JSON.stringify({ message: "Missing request origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const record = await getSessionRecord(request);
  if (!record) throw new Response("Unauthorized", { status: 401 });
  const supplied = formData.get("csrf");
  if (typeof supplied !== "string")
    throw new Response(
      JSON.stringify({ message: "Invalid CSRF token: missing from form" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  const expectedBuffer = Buffer.from(record.session.csrfSecret);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new Response(
      JSON.stringify({ message: "Invalid CSRF token: mismatch" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return record;
}
