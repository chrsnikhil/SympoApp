import React from "react";

interface ProgressBarProps {
  correctCount: number;
  totalCount: number;
}

export default function ProgressBar({ correctCount, totalCount }: ProgressBarProps) {
  const filled = "■".repeat(correctCount);
  const empty = "□".repeat(totalCount - correctCount);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm font-black uppercase tracking-widest text-red-400">
        Progress
      </div>
      <div className="flex items-center gap-4 bg-red-950/50 px-4 py-2 rounded-xl border border-red-500/30">
        <div className="text-xl tracking-[0.2em] text-red-500 font-mono">
          {filled}
          <span className="text-red-900/50">{empty}</span>
        </div>
        <div className="text-sm font-bold text-white font-mono">
          {correctCount} / {totalCount}
        </div>
      </div>
    </div>
  );
}
