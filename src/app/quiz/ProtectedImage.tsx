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

  useEffect(() => {
    const id = setInterval(() => setStamp(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  const watermarkText = `${teamName.toUpperCase()} • ${stamp}`;

  return (
    <div
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
    >
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
  );
}
