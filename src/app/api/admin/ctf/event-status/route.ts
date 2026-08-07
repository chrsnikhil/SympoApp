import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";

const SETTING_KEY = "ctf_event_state";
const DURATION_MINUTES = 105;

export async function GET() {
  try {
    const db = await getDb();
    const setting = await db.collection("system_settings").findOne({ key: SETTING_KEY });

    const rawState = setting?.state ?? "waiting";
    const startedAt = setting?.startedAt ? new Date(setting.startedAt).toISOString() : null;

    let remainingSeconds = DURATION_MINUTES * 60;
    let state = rawState;

    if (rawState === "started" && setting?.startedAt) {
      const startTime = new Date(setting.startedAt).getTime();
      const endTime = startTime + DURATION_MINUTES * 60 * 1000;
      remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      if (remainingSeconds === 0) {
        state = "ended";
        await db.collection("system_settings").updateOne(
          { key: SETTING_KEY },
          { $set: { state: "ended", updatedAt: new Date() } }
        );
      }
    }

    return NextResponse.json({
      state,
      startedAt,
      durationMinutes: DURATION_MINUTES,
      remainingSeconds,
    });
  } catch (err) {
    console.error("[api/admin/ctf/event-status GET] error", err);
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
    const action = body.action;

    const db = await getDb();

    if (action === "start") {
      const startedAt = new Date();
      await db.collection("system_settings").updateOne(
        { key: SETTING_KEY },
        {
          $set: {
            key: SETTING_KEY,
            state: "started",
            startedAt,
            durationMinutes: DURATION_MINUTES,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return NextResponse.json({
        ok: true,
        state: "started",
        startedAt: startedAt.toISOString(),
        durationMinutes: DURATION_MINUTES,
        remainingSeconds: DURATION_MINUTES * 60,
      });
    } else if (action === "end") {
      await db.collection("system_settings").updateOne(
        { key: SETTING_KEY },
        {
          $set: {
            key: SETTING_KEY,
            state: "ended",
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return NextResponse.json({
        ok: true,
        state: "ended",
        remainingSeconds: 0,
      });
    } else if (action === "reset") {
      await db.collection("system_settings").updateOne(
        { key: SETTING_KEY },
        {
          $set: {
            key: SETTING_KEY,
            state: "waiting",
            startedAt: null,
            durationMinutes: DURATION_MINUTES,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return NextResponse.json({
        ok: true,
        state: "waiting",
        startedAt: null,
        durationMinutes: DURATION_MINUTES,
        remainingSeconds: DURATION_MINUTES * 60,
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/ctf/event-status POST] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
