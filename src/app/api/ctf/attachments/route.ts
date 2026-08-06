import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

/**
 * Secure Attachment Download API.
 *
 * Checks session authorization before serving challenge attachments.
 * Never exposes raw internal storage paths to the client.
 */
export async function GET(request: Request) {
  try {
    await requireSession();

    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    const fileName = url.searchParams.get("file");

    if (!slug || !fileName) {
      return NextResponse.json({ error: "Missing challenge slug or filename" }, { status: 400 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "ctf", slug });
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Verify filename belongs to challenge attachments list or slug
    const attachments = challenge.config.attachments ?? [];
    const isAttached = attachments.includes(fileName) || fileName === `${slug}.zip` || fileName === `${slug}.pdf` || fileName === `${slug}.pcap`;

    // Unconditional. Challenges seeded with `attachments: []` used to skip this
    // check entirely, which let any authenticated participant pull every file
    // under public/uploads/ctf by naming another challenge's slug.
    if (!isAttached) {
      return NextResponse.json({ error: "Attachment not associated with this challenge" }, { status: 403 });
    }

    // File path in safe storage location
    const storageDir = join(process.cwd(), "public", "uploads", "ctf");
    const filePath = join(storageDir, fileName.replace(/\.\./g, "")); // sanitize path traversal

    if (!existsSync(filePath)) {
      // This used to serve a fake 1x1 PNG / 10-byte ZIP with HTTP 200, which is
      // indistinguishable from a corrupt download and — now that responses are
      // cached for a day — would stick for the rest of the event. A real
      // attachment missing from disk is an error, so say so, and never cache it.
      console.error(`[api/ctf/attachments] missing file on disk: ${filePath} (slug=${slug})`);
      return NextResponse.json(
        { error: "Attachment is not available" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const fileData = readFileSync(filePath);
    const ext = fileName.split(".").pop()?.toLowerCase();
    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    if (ext === "png") mimeType = "image/png";
    if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    if (ext === "zip") mimeType = "application/zip";
    if (ext === "pcap") mimeType = "application/vnd.tcpdump.pcap";

    return new Response(new Uint8Array(fileData), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
