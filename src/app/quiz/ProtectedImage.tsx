"use client";

import { useEffect, useState } from "react";

/**
 * Renders the Image Replication reference/upload previews with the easy copy
 * paths closed off: no context menu, no drag-out, no text/image selection,
 * no iOS long-press "Save Image" callout.
 *
 * None of that stops an OS-level screenshot or a phone camera pointed at the
 * screen — a browser has no way to prevent that, and this doesn't pretend
 * otherwise. What it CAN do is make anything captured that way traceable: a
 * live tiled watermark of the team name and timestamp is baked into the
 * rendered pixels, so a leaked screenshot or photo still identifies who took
 * it and when.
 */
export default function ProtectedImage({
  src,
  alt,
  teamName,
  className,
}: {
  src: string;
  alt: string;
  teamName: string;
  className?: string;
}) {
  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString());
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setStamp(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleBlur = () => setObscured(true);
    const handleFocus = () => setObscured(false);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        setObscured(true);
        setTimeout(() => setObscured(false), 2000);
        navigator.clipboard?.writeText("Screenshots are blocked.").catch(() => {});
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key)) {
        setObscured(true);
        setTimeout(() => setObscured(false), 5000);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const watermarkText = `${teamName.toUpperCase()} • ${stamp}`;

  return (
    <div
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`relative transition-opacity duration-75 ${obscured ? "opacity-0" : "opacity-100"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="pointer-events-none block w-full max-h-72 object-contain select-none"
        />

        {/* Tiled, live watermark — the point isn't to hide the image, it's to
            make sure any screenshot or phone photo of it still names the team
            and the moment it was taken. */}
        <div className="pointer-events-none absolute inset-0 flex flex-wrap content-around justify-around gap-4 overflow-hidden opacity-40 mix-blend-difference">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="whitespace-nowrap text-[10px] font-mono font-bold text-white -rotate-[28deg]"
            >
              {watermarkText}
            </span>
          ))}
        </div>
      </div>
      
      {obscured && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <p className="text-spider-red font-display uppercase tracking-widest text-center animate-pulse">
            Screenshot Blocked
          </p>
        </div>
      )}
    </div>
  );
}
