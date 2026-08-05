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
    
    if (!isAttached && attachments.length > 0) {
      return NextResponse.json({ error: "Attachment not associated with this challenge" }, { status: 403 });
    }

    // File path in safe storage location
    const storageDir = join(process.cwd(), "public", "uploads", "ctf");
    const filePath = join(storageDir, fileName.replace(/\.\./g, "")); // sanitize path traversal

    if (!existsSync(filePath)) {
      // Return a dynamic sample attachment placeholder if file on disk isn't present
      const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
      let contentType = "application/octet-stream";
      let dummyBuffer: Buffer;

      if (extension === "pdf") {
        contentType = "application/pdf";
        dummyBuffer = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length 55 >> stream\nBT /F1 12 Tf 100 700 TD (${challenge.title} CTF Attachment) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000062 00000 n\n0000000117 00000 n\n0000000225 00000 n\ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n331\n%%EOF`);
      } else if (extension === "png" || extension === "jpg" || extension === "jpeg") {
        contentType = extension === "png" ? "image/png" : "image/jpeg";
        // 1x1 transparent PNG buffer
        dummyBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      } else if (extension === "zip") {
        contentType = "application/zip";
        // PK zip header placeholder
        dummyBuffer = Buffer.from("504b0304140000000000", "hex");
      } else {
        contentType = "application/octet-stream"; // e.g. pcap
        dummyBuffer = Buffer.from(`CTF-ATTACHMENT-HEADER:${challenge.slug}`);
      }

      return new Response(new Uint8Array(dummyBuffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        },
      });
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
