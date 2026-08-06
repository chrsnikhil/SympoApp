import { NextResponse } from "next/server";
import { createHmac } from "crypto";

const JWT_SECRET = "canon_protocol_jwt_secret_spider_2026";

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", JWT_SECRET).update(signatureInput).digest();
  const encodedSignature = base64url(signature);
  return `${signatureInput}.${encodedSignature}`;
}

export async function POST(request: Request) {
  try {
    let body: { username?: string; password?: string } = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      body = {
        username: formData.get("username")?.toString(),
        password: formData.get("password")?.toString(),
      };
    }

    const { username, password } = body;

    if (username !== "guest" || password !== "guest123") {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const payload = {
      sub: "guest",
      tenant: "earth-1610",
      scope: "read",
      iat: Math.floor(Date.now() / 1000),
    };

    const token = signJwt(payload);

    return NextResponse.json({
      success: true,
      token,
      user: {
        username: "guest",
        tenant: "earth-1610",
        scope: "read",
      },
      message: "Guest authentication successful. Access to Canon Protocol Archive is restricted.",
    });
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 400 });
  }
}
