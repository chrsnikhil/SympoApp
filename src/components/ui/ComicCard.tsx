import React from "react";

interface ComicCardProps {
  children: React.ReactNode;
  className?: string;
  tilt?: "left" | "right" | "none";
  hasBenDay?: boolean;
  variant?: "surface" | "primary" | "tertiary" | "dark";
}

export default function ComicCard({
  children,
  className = "",
  tilt = "none",
  hasBenDay = true,
  variant = "surface",
}: ComicCardProps) {
  const variantStyles = {
    surface: "bg-surface text-on-surface",
    primary: "bg-primary text-on-primary",
    tertiary: "bg-tertiary-fixed text-on-tertiary-fixed",
    dark: "bg-on-background text-on-primary",
  };

  const tiltStyles = {
    left: "comic-tilt-left",
    right: "comic-tilt-right",
    none: "",
  };

  return (
    <div
      className={`relative comic-border p-6 md:p-8 overflow-hidden shadow-[8px_8px_0px_0px_rgba(27,27,28,1)] ${variantStyles[variant]} ${tiltStyles[tilt]} ${className}`}
    >
      {hasBenDay && <div className="absolute inset-0 ben-day pointer-events-none opacity-15" />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
