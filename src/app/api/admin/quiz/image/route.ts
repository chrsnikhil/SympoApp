import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

/**
 * Serve team uploaded prompt images on-demand with HTTP caching.
 * Keeps heavy base64 strings out of the periodic 3s admin overview payload.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
    }

    const promptImagesCol = await collections.promptImages();
    const doc = await promptImagesCol.findOne(
      { _id: new ObjectId(id) },
      { projection: { dataUrl: 1 } }
    );

    if (!doc?.dataUrl) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Match dataUrl scheme: data:image/png;base64,...
    const match = /^data:([^;,]+);base64,(.*)$/.exec(doc.dataUrl);
    if (!match) {
      // Fallback if not base64 formatted
      return NextResponse.redirect(doc.dataUrl);
    }

    const mime = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[admin/quiz/image] error", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
