import { NextResponse } from "next/server";
import { ADMIN_TOKEN } from "../router/route";

export async function GET(request: Request) {
  return handleAdmin(request);
}

export async function POST(request: Request) {
  return handleAdmin(request);
}

async function handleAdmin(request: Request) {
  try {
    const url = new URL(request.url);
    let token = url.searchParams.get("admin_token") || url.searchParams.get("token");

    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token) {
      try {
        const body = await request.json();
        token = body.admin_token || body.token;
      } catch {}
    }

    if (token !== ADMIN_TOKEN) {
      return NextResponse.json(
        {
          error: "401 Unauthorized",
          message: "Invalid administrator token",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      role: "Administrator",
      message: "Canon Protocol Master Access Granted.",
      flag: "SPIDER{burp_repeater_master}",
    });
  } catch {
    return NextResponse.json({ error: "Admin access error" }, { status: 500 });
  }
}
