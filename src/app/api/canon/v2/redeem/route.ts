import { NextResponse } from "next/server";
import { validateAndRedeemTempToken } from "@/lib/canon/store";

export async function POST(request: Request) {
  return handleRedeem(request);
}

export async function GET(request: Request) {
  return handleRedeem(request);
}

async function handleRedeem(request: Request) {
  try {
    const url = new URL(request.url);
    let token = url.searchParams.get("temp_token") || url.searchParams.get("token");

    if (!token) {
      try {
        const body = await request.json();
        token = body.temp_token || body.token;
      } catch {}
    }

    if (!token) {
      return NextResponse.json({ error: "Missing temp_token" }, { status: 400 });
    }

    const validation = validateAndRedeemTempToken(token);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "401 Unauthorized",
          message: validation.reason ?? "Session expired",
          hint: "Temporary tokens expire after 2000ms. Send fast concurrent requests using Burp Intruder or Repeater.",
        },
        { status: 401 }
      );
    }

    // Stage 5 Internal Host Discovery clue in response payload
    return NextResponse.json({
      success: true,
      archive_manifest: {
        title: "Canon Protocol Vault Manifest v4.2",
        author: "Miguel O'Hara",
        classification: "RESTRICTED",
        internal_routing_target: "internal-vault.spider.local",
        backup_config: {
          service_host: "internal-vault.spider.local",
          proxy_policy: "Trust Host / X-Forwarded-Host header",
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Redemption error" }, { status: 500 });
  }
}
