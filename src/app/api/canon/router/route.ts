import { NextResponse } from "next/server";

const TARGET_HOST = "internal-vault.spider.local";
export const ADMIN_TOKEN = "admin_tok_canon_master_8829";

export async function GET(request: Request) {
  return handleRouting(request);
}

export async function POST(request: Request) {
  return handleRouting(request);
}

async function handleRouting(request: Request) {
  try {
    const hostHeader = request.headers.get("host") || "";
    const xForwardedHost = request.headers.get("x-forwarded-host") || "";

    const isInternalHost =
      hostHeader.toLowerCase().includes(TARGET_HOST) ||
      xForwardedHost.toLowerCase().includes(TARGET_HOST) ||
      request.url.toLowerCase().includes(TARGET_HOST);

    if (!isInternalHost) {
      return NextResponse.json(
        {
          error: "404 Route Not Found",
          message: `Public gateway cannot route request. Reverse proxy requires internal Host or X-Forwarded-Host: ${TARGET_HOST}`,
        },
        { status: 404 }
      );
    }

    // Parsed internal app request
    const url = new URL(request.url);
    let targetUrl = url.searchParams.get("url") || url.searchParams.get("target");

    if (!targetUrl) {
      try {
        const body = await request.json();
        targetUrl = body.url || body.target;
      } catch {}
    }

    if (!targetUrl) {
      return NextResponse.json({
        service: "Internal Vault Administration Gateway",
        status: "active",
        endpoints: {
          fetch_url: "POST /api/canon/router?url=<target>",
        },
        notice: "Provide 'url' parameter to fetch internal system metrics.",
      });
    }

    // Stage 7 Naive Localhost Filter:
    const lowerUrl = targetUrl.toLowerCase();
    if (lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")) {
      return NextResponse.json(
        {
          error: "403 Forbidden",
          message: "Security Filter Triggered: Direct 'localhost' and '127.0.0.1' access is blocked.",
          hint: "Filter only performs string matching against 'localhost' and '127.0.0.1'.",
        },
        { status: 403 }
      );
    }

    // Check if URL attempts loopback access to internal admin endpoint (e.g. 127.0.0.2, 127.1, 0x7f.0.0.1, 2130706433, 0.0.0.0, [::1])
    const isLoopbackBypass =
      lowerUrl.includes("127.") ||
      lowerUrl.includes("0.0.0.0") ||
      lowerUrl.includes("[::1]") ||
      lowerUrl.includes("2130706433") ||
      lowerUrl.includes("0x7f");

    if (isLoopbackBypass && lowerUrl.includes("admin")) {
      return NextResponse.json({
        success: true,
        fetched_from: targetUrl,
        admin_response: {
          system: "Canon Protocol Central Core",
          role: "Administrator",
          admin_token: ADMIN_TOKEN,
          notice: "Submit admin_token to /api/canon/admin to retrieve master flag.",
        },
      });
    }

    return NextResponse.json({
      success: true,
      fetched_from: targetUrl,
      status: 200,
      content: `Simulated fetch output from ${targetUrl}`,
    });
  } catch {
    return NextResponse.json({ error: "Routing failure" }, { status: 500 });
  }
}
