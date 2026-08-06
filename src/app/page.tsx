"use client";

import { useState } from "react";
import MysteryRoom from "@/app/hunt/puzzles/MysteryRoom";

export default function Home() {
  const [answer, setAnswer] = useState("");

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <MysteryRoom config={{}} onSolve={(code) => setAnswer(code)} />

      {answer && (
        <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#22e0ff] bg-black/90 px-4 py-2 font-mono text-sm shadow-xl">
          <span className="text-[#22e0ff] font-bold">REVEAL CODE:</span>{" "}
          <span className="text-white font-mono">{answer}</span>
        </div>
      )}
    </main>
  );
}
