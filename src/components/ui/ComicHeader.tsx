import React from "react";
import type { Avatar } from "@/lib/quiz/avatars";

interface ComicHeaderProps {
  issueTitle?: string;
  issueNumber?: string;
  roundStamp?: string;
  teamName?: string;
  avatar?: Avatar | null;
}

export default function ComicHeader({
  issueTitle = "Action Tales!",
  issueNumber = "No. 1",
  roundStamp,
  teamName,
  avatar,
}: ComicHeaderProps) {
  return (
    <header className="relative z-50 pt-gutter px-gutter mb-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-panel-gap bg-surface comic-border p-4">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-on-primary px-3 py-1 comic-border -rotate-2 font-headline-lg text-headline-lg uppercase tracking-tighter shadow-none">
            {issueNumber}
          </div>
          <span className="font-display-xl text-headline-lg text-on-surface uppercase italic">
            {issueTitle}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {teamName && (
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full comic-border-sm flex items-center justify-center font-display-xl text-on-primary text-base shrink-0"
                style={{ backgroundColor: avatar?.colour ?? "#a41616" }}
              >
                {teamName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-headline-lg text-caption-bold uppercase leading-none">{teamName}</div>
                <div className="font-label-sm text-[10px] text-on-surface-variant uppercase mt-0.5">
                  {avatar ? avatar.name : "Spider Hero"}
                </div>
              </div>
            </div>
          )}

          {roundStamp && (
            <div
              id="status-stamp"
              className="bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2 comic-border rotate-1 font-label-sm uppercase text-[12px]"
            >
              {roundStamp}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
