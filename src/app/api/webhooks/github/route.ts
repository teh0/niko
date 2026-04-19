import { NextRequest } from "next/server";
import { getWebhooks } from "@/lib/github/webhooks";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const id = req.headers.get("x-github-delivery") ?? "";
  const name = req.headers.get("x-github-event") ?? "";
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const body = await req.text();

  try {
    await getWebhooks().verifyAndReceive({
      id,
      name: name as Parameters<ReturnType<typeof getWebhooks>["verifyAndReceive"]>[0]["name"],
      payload: body,
      signature,
    });
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[webhooks/github] error:", err);
    return new Response("bad signature or payload", { status: 400 });
  }
}
