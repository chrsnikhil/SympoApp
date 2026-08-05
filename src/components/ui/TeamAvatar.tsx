"use client";

import React from "react";
import type { Avatar } from "@/lib/quiz/avatars";
import { avatarById, avatarForTeamName } from "@/lib/quiz/avatars";

interface TeamAvatarProps {
  avatar?: Avatar | null;
  avatarId?: string | null;
  avatarColour?: string | null;
  avatarName?: string | null;
  teamName?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showTitle?: boolean;
}

const SIZE_MAP = {
  xs: "w-5 h-5 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-xl",
  xl: "w-20 h-20 text-3xl",
};

const MASK_SIZE_MAP = {
  xs: 12,
  sm: 18,
  md: 24,
  lg: 34,
  xl: 48,
};

/**
 * Render specialized Spider-Verse Multiverse SVG mask graphics for each hero identity
 */
function SpiderMaskSvg({ id, colour, size = 24 }: { id: string; colour: string; size?: number }) {
  switch (id) {
    case "miles":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Miles Morales Head Mask */}
          <path d="M50 5 C22 5 15 32 15 60 C15 82 35 95 50 95 C65 95 85 82 85 60 C85 32 78 5 50 5 Z" fill="#14161a" stroke="#e5223b" strokeWidth="4" />
          {/* Eyes with red spray border */}
          <path d="M26 42 Q38 38 45 52 Q32 64 26 42 Z" fill="#ffffff" stroke="#ff2a6d" strokeWidth="4" />
          <path d="M74 42 Q62 38 55 52 Q68 64 74 42 Z" fill="#ffffff" stroke="#ff2a6d" strokeWidth="4" />
          {/* Spider emblem accent */}
          <path d="M50 68 L44 78 M50 68 L56 78 M50 68 L50 84" stroke="#e5223b" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    case "gwen":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Spider-Gwen Hood */}
          <path d="M50 2 C18 2 8 30 8 62 C8 88 32 98 50 98 C68 98 92 88 92 62 C92 30 82 2 50 2 Z" fill="#f2efe9" stroke="#1b1b1c" strokeWidth="3" />
          {/* Inner hood lining */}
          <path d="M50 12 C28 12 18 35 18 62 C18 80 34 88 50 88 C66 88 82 80 82 62 C82 35 72 12 50 12 Z" fill="#00e5ff" />
          {/* Face mask */}
          <path d="M50 24 C32 24 24 40 24 62 C24 78 36 84 50 84 C64 84 76 78 76 62 C76 40 68 24 50 24 Z" fill="#f2efe9" />
          {/* Magenta Eyes */}
          <path d="M28 46 C36 40 46 45 46 54 C36 62 28 58 28 46 Z" fill="#ffffff" stroke="#ff6ec7" strokeWidth="4" />
          <path d="M72 46 C64 40 54 45 54 54 C64 62 72 58 72 46 Z" fill="#ffffff" stroke="#ff6ec7" strokeWidth="4" />
        </svg>
      );

    case "miguel":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Spider-Man 2099 Cyber Helmet */}
          <path d="M50 4 C22 4 12 30 12 58 C12 84 34 96 50 96 C66 96 88 84 88 58 C88 30 78 4 50 4 Z" fill="#001830" stroke="#00e5ff" strokeWidth="4" />
          {/* Spiky Red Reticle Visor */}
          <path d="M50 28 L40 45 L20 40 L35 55 L25 72 L45 62 L50 78 L55 62 L75 72 L65 55 L80 40 L60 45 Z" fill="#b3122b" stroke="#ff0038" strokeWidth="3" />
          <path d="M50 35 L42 48 L30 44 L40 55 L32 66 L46 58 L50 70 L54 58 L68 66 L60 55 L70 44 L58 48 Z" fill="#00e5ff" />
        </svg>
      );

    case "spider-punk":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Spikes on top */}
          <path d="M35 15 L40 2 M50 12 L50 0 M65 15 L60 2" stroke="#e63946" strokeWidth="6" strokeLinecap="round" />
          {/* Head mask */}
          <path d="M50 10 C22 10 15 34 15 60 C15 82 35 95 50 95 C65 95 85 82 85 60 C85 34 78 10 50 10 Z" fill="#e63946" stroke="#1d3557" strokeWidth="4" />
          {/* Asymmetric Punk Eyes */}
          <path d="M24 40 L46 36 L42 60 L22 52 Z" fill="#ffffff" stroke="#1d3557" strokeWidth="4" />
          <path d="M76 38 L54 44 L58 64 L78 54 Z" fill="#ffffff" stroke="#1d3557" strokeWidth="4" />
        </svg>
      );

    case "pavitr":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Pavitr Prabhakar Mask */}
          <path d="M50 5 C22 5 15 32 15 60 C15 82 35 95 50 95 C65 95 85 82 85 60 C85 32 78 5 50 5 Z" fill="#c1121f" stroke="#ff9f1c" strokeWidth="4" />
          {/* Mandala Pattern Center */}
          <circle cx="50" cy="22" r="8" stroke="#ff9f1c" strokeWidth="2" fill="none" />
          {/* Gold Trimmed Eyes */}
          <path d="M25 42 Q38 35 46 50 Q32 64 25 42 Z" fill="#ffffff" stroke="#ff9f1c" strokeWidth="4" />
          <path d="M75 42 Q62 35 54 50 Q68 64 75 42 Z" fill="#ffffff" stroke="#ff9f1c" strokeWidth="4" />
        </svg>
      );

    case "spider-noir":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Fedora Brim */}
          <path d="M5 40 Q50 20 95 40 L85 30 Q50 15 15 30 Z" fill="#212529" stroke="#495057" strokeWidth="2" />
          {/* Mask Base */}
          <path d="M50 35 C25 35 20 52 20 72 C20 88 35 96 50 96 C65 96 80 88 80 72 C80 52 75 35 50 35 Z" fill="#212529" stroke="#adb5bd" strokeWidth="3" />
          {/* Round Detective Goggles */}
          <circle cx="36" cy="56" r="12" fill="#ffffff" stroke="#adb5bd" strokeWidth="4" />
          <circle cx="64" cy="56" r="12" fill="#ffffff" stroke="#adb5bd" strokeWidth="4" />
          <line x1="48" y1="56" x2="52" y2="56" stroke="#adb5bd" strokeWidth="4" />
        </svg>
      );

    case "spider-ham":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Peter Porker Round Head */}
          <circle cx="50" cy="50" r="42" fill="#ff70a6" stroke="#ff0a54" strokeWidth="4" />
          {/* Cartoon Pig Snout */}
          <ellipse cx="50" cy="68" rx="16" ry="11" fill="#ff97b7" stroke="#ff0a54" strokeWidth="3" />
          <circle cx="44" cy="68" r="3" fill="#ff0a54" />
          <circle cx="56" cy="68" r="3" fill="#ff0a54" />
          {/* Big expressive Spider Eyes */}
          <path d="M22 35 C32 25 44 35 44 48 C32 52 22 45 22 35 Z" fill="#ffffff" stroke="#1b1b1c" strokeWidth="3" />
          <path d="M78 35 C68 25 56 35 56 48 C68 52 78 45 78 35 Z" fill="#ffffff" stroke="#1b1b1c" strokeWidth="3" />
        </svg>
      );

    case "peni":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* SP//dr Anime Mech Visor */}
          <path d="M50 5 L88 28 L88 72 L50 95 L12 72 L12 28 Z" fill="#00121e" stroke="#00f5d4" strokeWidth="4" />
          {/* Glowing Digital Cat Eyes */}
          <path d="M22 42 L42 38 L36 58 Z" fill="#00f5d4" />
          <path d="M78 42 L58 38 L64 58 Z" fill="#00f5d4" />
          <circle cx="50" cy="68" r="6" fill="#fee440" />
        </svg>
      );

    case "spider-byte":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cyber Digital Hologram Head */}
          <path d="M50 6 C24 6 16 30 16 58 C16 82 35 94 50 94 C65 94 84 82 84 58 C84 30 76 6 50 6 Z" fill="#240046" stroke="#7000ff" strokeWidth="4" />
          {/* Pixel Visor Eyes */}
          <rect x="24" y="42" width="22" height="14" rx="3" fill="#00f0ff" />
          <rect x="54" y="42" width="22" height="14" rx="3" fill="#00f0ff" />
          <line x1="20" y1="65" x2="80" y2="65" stroke="#ff007f" strokeWidth="3" strokeDasharray="4 4" />
        </svg>
      );

    default:
      // Classic Spider-Man
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 5 C22 5 15 32 15 60 C15 82 35 95 50 95 C65 95 85 82 85 60 C85 32 78 5 50 5 Z" fill="#e5223b" stroke="#1b1b1c" strokeWidth="4" />
          {/* Web Lines */}
          <path d="M50 5 L50 95 M15 60 L85 60 M25 30 L75 90 M75 30 L25 90" stroke="#1b1b1c" strokeWidth="1.5" opacity="0.4" />
          {/* Classic Eyes */}
          <path d="M25 40 Q38 35 45 52 Q32 65 25 40 Z" fill="#ffffff" stroke="#1b1b1c" strokeWidth="4" />
          <path d="M75 40 Q62 35 55 52 Q68 65 75 40 Z" fill="#ffffff" stroke="#1b1b1c" strokeWidth="4" />
        </svg>
      );
  }
}

export default function TeamAvatar({
  avatar,
  avatarId,
  avatarColour,
  avatarName,
  teamName,
  size = "md",
  className = "",
  showTitle = false,
}: TeamAvatarProps) {
  // Resolve avatar object
  const resolvedAvatar =
    avatar ??
    (avatarId ? avatarById(avatarId) : null) ??
    (teamName ? avatarForTeamName(teamName) : null) ??
    avatarById("spider-man")!;

  const bgColour = avatarColour ?? resolvedAvatar.colour ?? "#3a86ff";
  const heroName = avatarName ?? resolvedAvatar.name ?? "Spider-Hero";
  const heroId = resolvedAvatar.id ?? "spider-man";

  const sizeClass = SIZE_MAP[size] ?? SIZE_MAP.md;
  const maskSize = MASK_SIZE_MAP[size] ?? MASK_SIZE_MAP.md;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        className={`${sizeClass} rounded-full comic-border-sm flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_rgba(27,27,28,1)] transition-transform hover:scale-105 overflow-hidden`}
        style={{ backgroundColor: bgColour }}
        title={`${heroName}${teamName ? ` (${teamName})` : ""}`}
      >
        <SpiderMaskSvg id={heroId} colour={bgColour} size={maskSize} />
      </div>

      {showTitle && (
        <div className="text-left min-w-0">
          {teamName && <div className="font-headline-lg text-xs uppercase leading-tight truncate text-on-surface">{teamName}</div>}
          <div className="font-label-sm text-[10px] text-primary uppercase leading-none mt-0.5">{heroName}</div>
        </div>
      )}
    </div>
  );
}
