import React from "react";

interface ComicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "dark" | "outline";
  tilt?: "left" | "right" | "none";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export default function ComicButton({
  variant = "primary",
  tilt = "none",
  size = "md",
  className = "",
  children,
  ...props
}: ComicButtonProps) {
  const variantStyles = {
    primary: "bg-primary text-on-primary hover:bg-primary-fixed-variant",
    secondary: "bg-secondary text-on-secondary hover:bg-on-secondary-fixed-variant",
    tertiary: "bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim",
    dark: "bg-on-background text-on-primary hover:bg-primary",
    outline: "bg-surface text-on-surface hover:bg-surface-container",
  };

  const tiltStyles = {
    left: "comic-tilt-left",
    right: "comic-tilt-right",
    none: "",
  };

  const sizeStyles = {
    sm: "px-4 py-2 text-xs font-headline-lg uppercase tracking-wider",
    md: "px-8 py-4 font-headline-lg text-sm md:text-base uppercase tracking-widest",
    lg: "px-10 py-6 font-display-xl text-lg md:text-2xl uppercase tracking-widest",
  };

  return (
    <button
      className={`relative comic-border transition-all duration-100 hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[6px_6px_0px_0px_rgba(27,27,28,1)] active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${variantStyles[variant]} ${tiltStyles[tilt]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}
