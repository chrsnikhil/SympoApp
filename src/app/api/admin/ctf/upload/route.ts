import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const challengeSlug = formData.get("slug") as string | null;

    if (!file || !challengeSlug) {
      return NextResponse.json({ error: "Missing file or challenge slug" }, { status: 400 });
    }

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase();
    const allowed = ["zip", "pdf", "png", "jpg", "jpeg", "pcap"];
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json({ error: "File format not supported. Allowed: zip, pdf, png, jpg, pcap" }, { status: 400 });
    }

    const uploadDir = join(process.cwd(), "public", "uploads", "ctf");
    mkdirSync(uploadDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const savePath = join(uploadDir, fileName);
    writeFileSync(savePath, buffer);

    // Attach filename to challenge document in DB
    const challengesCollection = await collections.challenges();
    await challengesCollection.updateOne(
      { type: "ctf", slug: challengeSlug },
      { $addToSet: { "config.attachments": fileName } }
    );

    return NextResponse.json({ ok: true, fileName, message: "Attachment uploaded successfully" });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
