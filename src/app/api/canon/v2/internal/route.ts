import { NextResponse } from "next/server";
import { createTempToken } from "@/lib/canon/store";

export async function GET(request: Request) {
  return handleInternal(request);
}

export async function POST(request: Request) {
  return handleInternal(request);
}

async function handleInternal(request: Request) {
  try {
    const url = new URL(request.url);
    const queryTenants = url.searchParams.getAll("tenant");

    let bodyTenants: string[] = [];
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.clone().formData();
      bodyTenants = formData.getAll("tenant").map((v) => v.toString());
    } else if (contentType.includes("application/json")) {
      try {
        const json = await request.clone().json();
        if (Array.isArray(json.tenant)) {
          bodyTenants = json.tenant.map((v: unknown) => String(v));
        } else if (typeof json.tenant === "string") {
          bodyTenants = [json.tenant];
        }
      } catch {}
    }

    const allTenants = [...queryTenants, ...bodyTenants];

    // Stage 3 HPP Vulnerability Check:
    // Requires multiple 'tenant' parameters where one is 'earth-1610' and another is 'hq'
    const hasEarth1610 = allTenants.includes("earth-1610");
    const hasHq = allTenants.includes("hq");
    const isHpp = (allTenants.length >= 2 && hasEarth1610 && hasHq) || request.url.includes("tenant=earth-1610&tenant=hq");

    if (!isHpp) {
      return NextResponse.json(
        {
          error: "403 Forbidden",
          message: "Guest tenant 'earth-1610' is not authorized to access internal v2 protocol archive.",
          hint: "Parameter validation rejected single tenant claim.",
        },
        { status: 403 }
      );
    }

    // Issue short-lived token for Stage 4 Race Condition
    const tempToken = createTempToken();

    return NextResponse.json({
      status: "authorized_temporary_elevation",
      tenant_override: "hq",
      temp_token: tempToken,
      expires_in: "2000ms",
      message: "Temporary session token issued. Redeem at /api/canon/v2/redeem before token invalidation.",
    });
  } catch {
    return NextResponse.json({ error: "403 Forbidden" }, { status: 403 });
  }
}
