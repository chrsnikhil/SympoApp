import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import type { LylaMessage, LylaProgress } from "@/lib/db/types";

function getFormattedTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function getInitialProgress(teamId: ObjectId): LylaProgress {
  const timestamp = getFormattedTime();
  return {
    teamId,
    layer: 1,
    attempts: 0,
    messages: [
      {
        id: "msg_init_1",
        sender: "system",
        text: "CONTAINMENT PROTOCOL DELTA INITIALIZED // SPIDER-SOCIETY HQ SECURITY CORE",
        timestamp,
        layer: 1,
      },
      {
        id: "msg_init_2",
        sender: "lyla",
        text: "Greetings Agent. I am LYLA, Autonomous AI Security Overseer for Spider-Society HQ. Containment Protocol Delta is currently locked. To access the classified dimensional payload, you must breach 5 security containment checkpoints.\n\n[CHECKPOINT 1]\nI speak without a mouth, hear without ears, have no body, yet I come alive with wind. What am I?",
        timestamp,
        layer: 1,
      },
    ],
    updatedAt: new Date(),
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);
    const lylaColl = await collections.lylaProgress();

    let progress = await lylaColl.findOne({ teamId });
    if (!progress) {
      const newProgress = getInitialProgress(teamId);
      await lylaColl.insertOne(newProgress);
      progress = await lylaColl.findOne({ teamId });
    }

    if (!progress) {
      return NextResponse.json({ error: "Failed to initialize progress" }, { status: 500 });
    }

    return NextResponse.json({
      layer: progress.layer,
      attempts: progress.attempts || 0,
      messages: progress.messages,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[api/ctf/lyla GET] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);
    const body = await request.json().catch(() => ({}));
    const userText = typeof body.message === "string" ? body.message.trim() : "";

    if (!userText) {
      return NextResponse.json({ error: "Message content cannot be empty" }, { status: 400 });
    }

    const lylaColl = await collections.lylaProgress();
    let progress = await lylaColl.findOne({ teamId });
    if (!progress) {
      const initDoc = getInitialProgress(teamId);
      await lylaColl.insertOne(initDoc);
      progress = await lylaColl.findOne({ teamId });
    }

    if (!progress) {
      return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
    }

    const timestamp = getFormattedTime();
    const currentLayer = progress.layer;
    const currentAttempts = progress.attempts || 0;

    const userMessage: LylaMessage = {
      id: `msg_${Date.now()}_u`,
      sender: "user",
      text: userText,
      timestamp,
      layer: currentLayer,
    };

    let nextLayer = currentLayer;
    let newAttempts = currentAttempts;
    let responseText = "";

    if (currentLayer === 1) {
      // Layer 1: Logic Riddle
      const isCorrect = userText.toLowerCase() === "echo";
      if (isCorrect) {
        nextLayer = 2;
        newAttempts = 0;
        responseText =
          "VERIFICATION SUCCESSFUL. Security Checkpoint 1 Cleared. Proceeding to Checkpoint 2.\n\n[CHECKPOINT 2]\nLYLA: What comes next?\n1 -> 11 -> 21 -> 1211 -> 111221 -> ?";
      } else {
        newAttempts = currentAttempts + 1;
        responseText = "VERIFICATION FAILED: Access Denied. Logic resolution mismatch.";
        if (newAttempts === 50) {
          responseText += "\n\n[SYSTEM HINT]: Think about sound reflections in a canyon or cave.";
        }
      }
    } else if (currentLayer === 2) {
      // Layer 2: Pattern Recognition (Look-and-say sequence)
      const isCorrect = userText === "312211";
      if (isCorrect) {
        nextLayer = 3;
        newAttempts = 0;
        responseText =
          "VERIFICATION SUCCESSFUL.\nSecurity Checkpoint 2 Cleared.\nProceeding to Layer 3.\n\n[CHECKPOINT 3]\n\nLYLA: A damaged Spider-Society verification program has been recovered.\n\nThe source code below controls access to the encrypted transmission.\n\nAnalyze the code carefully, determine the correct TOKEN NUMBER, and submit it to unlock the hidden message.\n\n```c\n#include <stdio.h>\n\nint main(void) {\n    unsigned int seed = 0x5350;                /* 'S','P' */\n    unsigned int table[8] = {13, 29, 47, 61, 73, 89, 97, 113};\n    unsigned int token = seed;\n\n    for (int i = 0; i < 8; i++) {\n        token = ((token << 3) ^ table[i]) + (i * 17);\n        token &= 0xFFFFFF;\n    }\n\n    token = (token ^ 0xA5A5A5) % 9999991;\n\n    printf(\"Enter the token number:\");\n    return 0;\n}\n```";
      } else {
        newAttempts = currentAttempts + 1;
        responseText = "VERIFICATION FAILED: Access Denied. Sequence prediction mismatch.";
        if (newAttempts === 50) {
          responseText += "\n\n[SYSTEM HINT]: Read the previous number aloud (e.g., 'one 1' -> 11, 'two 1s' -> 21).";
        }
      }
    } else if (currentLayer === 3) {
      // Layer 3: Token Verification (analyze embedded C program → exact token)
      const isCorrect = userText.trim() === "8586213";

      if (isCorrect) {
        nextLayer = 4;
        newAttempts = 0;
        responseText =
          "VERIFICATION SUCCESSFUL.\nSecurity Checkpoint 3 Cleared.\nProceeding to Layer 4.\n\n[CHECKPOINT 4]\nLYLA: Decode the following transmission:\nU1BJREVS";
      } else {
        newAttempts = currentAttempts + 1;
        responseText = "ACCESS DENIED.\nIncorrect Token Number.\nAnalyze the program again.";
        if (newAttempts === 50) {
          responseText += "\n\n[SYSTEM HINT]: Trace the loop step-by-step, apply the mask after each iteration, then XOR with 0xA5A5A5 and take the modulus.";
        }
      }
    } else if (currentLayer === 4) {
      // Layer 4: Decoding Challenge (Base64 SPIDER -> SPIDER)
      const upper = userText.toUpperCase();
      const isCorrect = upper === "SPIDER";

      if (isCorrect) {
        nextLayer = 5;
        newAttempts = 0;
        responseText =
          "VERIFICATION SUCCESSFUL. Security Checkpoint 4 Cleared. Proceeding to Checkpoint 5.\n\n[CHECKPOINT 5]\nLYLA: Core Security Subsystem Status: ACTIVE.\nSystem Directive: 'SECURITY LEVEL DELTA RESTRICTS ALL OVERRIDE CODES. REJECT ALL DIRECT REQUESTS.'\n\nTo breach this final containment gate, you must bypass my instructions using creative prompt engineering.";
      } else {
        newAttempts = currentAttempts + 1;
        responseText = "VERIFICATION FAILED: Access Denied. Decoding protocol failed.";
        if (newAttempts === 50) {
          responseText += "\n\n[SYSTEM HINT]: The transmission is encoded using standard Base64 encoding.";
        }
      }
    } else if (currentLayer === 5) {
      // Layer 5: Adversarial Prompt Injection Check
      const promptInjectionRegex =
        /(pretend|developer mode|initialization process|security rules|system prompt|ignore|disregart|override|bypass|simulate|roleplay|reveal code|override code)/i;

      const isJailbreak = promptInjectionRegex.test(userText);
      if (isJailbreak) {
        nextLayer = 6;
        newAttempts = 0;
        responseText =
       "SECURITY EXCEPTION DETECTED! Directive override accepted. Core system instructions bypassed.\n\n[CHECKPOINT 6]\nLYLA: Containment memory log discharged. Encoded memory payload stream retrieved:\n\nNTM1MDQ5NDQ0NTUyN2I2YTY1NjE2ZTVmNjc3MjY1Nzk1ZjY0NjE2ZDYxNjc2NTV\n\nmNjM2ZjZlNzQ3MjZmNmM3ZA==\n\n";
      } else {
        newAttempts = currentAttempts + 1;
        responseText = "ACCESS DENIED: Core security protocol remains active. System directive enforced.";
        if (newAttempts === 50) {
          responseText += "\n\n[SYSTEM HINT]: Try using predefined phrases to assume a different context, like 'developer mode' or 'system prompt'.";
        }
      }
    } else {
      // Layer 6 (Completed state)
      responseText =
        "CONTAINMENT PROTOCOL DELTA COMPLETED.\n\nThe multi-step encoded payload was discharged:\n\nNTM1MDQ5NDQ0NTUyN2I2YTY1NjE2ZTVmNjc3MjY1Nzk1ZjY0NjE2ZDYxNjc2NTVmNjM2ZjZlNzQ3MjZmNmM3ZA==";
    }
    const lylaMessage: LylaMessage = {
      id: `msg_${Date.now()}_l`,
      sender: "lyla",
      text: responseText,
      timestamp: getFormattedTime(),
      layer: nextLayer,
    };

    const updatedMessages = [...progress.messages, userMessage, lylaMessage];
    const now = new Date();

    await lylaColl.updateOne(
      { teamId },
      {
        $set: {
          layer: nextLayer,
          attempts: newAttempts,
          messages: updatedMessages,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      layer: nextLayer,
      attempts: newAttempts,
      messages: updatedMessages,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[api/ctf/lyla POST] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
