import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ObjectId, type Filter } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import type { Challenge } from "@/lib/db/types";

function sha256(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const challengesCollection = await collections.challenges();
    const ctfChallenges = await challengesCollection.find({ type: "ctf" }).toArray();

    return NextResponse.json({ challenges: ctfChallenges });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const {
      slug,
      title,
      difficulty,
      category,
      description,
      flag,
      initialPoints,
      minimumPoints,
      decayAfter,
      status,
    } = body;

    if (!slug || !title || !flag) {
      return NextResponse.json({ error: "Missing required challenge fields (slug, title, flag)" }, { status: 400 });
    }

    const challengesCollection = await collections.challenges();
    const existing = await challengesCollection.findOne({ type: "ctf", slug });
    if (existing) {
      return NextResponse.json({ error: "Challenge slug already exists" }, { status: 400 });
    }

    const initialPts = Number(initialPoints) || 100;

    await challengesCollection.insertOne({
      type: "ctf",
      slug: slug.trim(),
      title: title.trim(),
      points: initialPts,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256(flag),
        difficulty: difficulty || "Easy",
        category: category || "General",
        description: description || "",
        initialPoints: initialPts,
        minimumPoints: Number(minimumPoints) || 50,
        decayAfter: Number(decayAfter) || 3,
        status: status || "open",
        attachments: [],
      },
    });

    return NextResponse.json({ ok: true, message: "Challenge created successfully" });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      slug,
      title,
      difficulty,
      category,
      description,
      flag,
      initialPoints,
      minimumPoints,
      decayAfter,
      status,
      disabled,
    } = body;

    if (!id && !slug) {
      return NextResponse.json({ error: "Missing challenge ID or slug" }, { status: 400 });
    }

    const challengesCollection = await collections.challenges();
    const filter: Filter<Challenge> = id ? { _id: new ObjectId(id) } : { type: "ctf" as const, slug };

    const existing = await challengesCollection.findOne(filter);
    if (!existing) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const updateConfig: Record<string, unknown> = { ...existing.config };

    if (difficulty !== undefined) updateConfig.difficulty = difficulty;
    if (category !== undefined) updateConfig.category = category;
    if (description !== undefined) updateConfig.description = description;
    if (initialPoints !== undefined) updateConfig.initialPoints = Number(initialPoints);
    if (minimumPoints !== undefined) updateConfig.minimumPoints = Number(minimumPoints);
    if (decayAfter !== undefined) updateConfig.decayAfter = Number(decayAfter);
    if (status !== undefined) updateConfig.status = status; // open, closed, released, hidden
    if (disabled !== undefined) updateConfig.disabled = Boolean(disabled);

    if (flag && typeof flag === "string" && flag.trim()) {
      updateConfig.answerHash = sha256(flag);
    }

    await challengesCollection.updateOne(filter, {
      $set: {
        title: title !== undefined ? title.trim() : existing.title,
        points: initialPoints !== undefined ? Number(initialPoints) : existing.points,
        config: updateConfig,
      },
    });

    return NextResponse.json({ ok: true, message: "Challenge updated successfully" });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update challenge" }, { status: 500 });
  }
}
