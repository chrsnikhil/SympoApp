export interface UniverseTheme {
  index: number;
  codename: string;
  designation: string;
  tagline: string;
  /** Primary accent color */
  primary: string;
  /** Secondary accent color */
  secondary: string;
  /** Glow / shadow color (with alpha) */
  glow: string;
  /** Full-bleed background gradient */
  bgGradient: string;
  /** Card border gradient */
  borderGradient: string;
  /** Particle / floating element color */
  particleColor: string;
  /** Hex shade used for grid tile backgrounds */
  tileColor: string;
  /** Pre-assigned 8-letter word (placeholder — swap before seeding) */
  word: string;
}

export const UNIVERSES: UniverseTheme[] = [
  {
    index: 0,
    codename: "RIOT",
    designation: "Earth-616",
    tagline: "Where every rooftop tells a story of courage.",
    primary: "#E63946",
    secondary: "#1D3557",
    glow: "rgba(230, 57, 70, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 30% 20%, rgba(230,57,70,0.25) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(29,53,87,0.35) 0%, transparent 50%), linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a14 100%)",
    borderGradient:
      "linear-gradient(135deg, #E63946 0%, transparent 40%, transparent 60%, #1D3557 100%)",
    particleColor: "#E63946",
    tileColor: "#C1121F",
    word: "COMPILER",
  },
  {
    index: 1,
    codename: "PUNK",
    designation: "Earth-138",
    tagline: "Smash the system. Rebuild it louder.",
    primary: "#FF6B00",
    secondary: "#1A1A1A",
    glow: "rgba(255, 107, 0, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 20% 30%, rgba(255,107,0,0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(255,165,0,0.1) 0%, transparent 40%), linear-gradient(135deg, #0a0a0a 0%, #1a0f00 50%, #0a0a0a 100%)",
    borderGradient:
      "linear-gradient(135deg, #FF6B00 0%, transparent 40%, transparent 60%, #FFA500 100%)",
    particleColor: "#FF6B00",
    tileColor: "#E85D04",
    word: "DATABASE",
  },
  {
    index: 2,
    codename: "SLAM",
    designation: "Earth-8311",
    tagline: "Big energy. Bigger laughs. Biggest heart.",
    primary: "#FFD60A",
    secondary: "#FF9E00",
    glow: "rgba(255, 214, 10, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 40% 20%, rgba(255,214,10,0.2) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(255,158,0,0.15) 0%, transparent 50%), linear-gradient(135deg, #0a0a0a 0%, #1a1500 50%, #0a0800 100%)",
    borderGradient:
      "linear-gradient(135deg, #FFD60A 0%, transparent 40%, transparent 60%, #FF9E00 100%)",
    particleColor: "#FFD60A",
    tileColor: "#E9C46A",
    word: "FUNCTION",
  },
  {
    index: 3,
    codename: "VENOM",
    designation: "Earth-1000",
    tagline: "In the dark, we become something more.",
    primary: "#00B4D8",
    secondary: "#0A0A0A",
    glow: "rgba(0, 180, 216, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 50% 30%, rgba(0,180,216,0.15) 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, rgba(0,100,120,0.1) 0%, transparent 40%), linear-gradient(135deg, #050808 0%, #0a1214 50%, #050505 100%)",
    borderGradient:
      "linear-gradient(135deg, #00B4D8 0%, transparent 40%, transparent 60%, #006B80 100%)",
    particleColor: "#00B4D8",
    tileColor: "#2A9D8F",
    word: "VARIABLE",
  },
  {
    index: 4,
    codename: "ELECTRIC",
    designation: "Earth-928",
    tagline: "The future runs on lightning and will.",
    primary: "#4361EE",
    secondary: "#7209B7",
    glow: "rgba(67, 97, 238, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 30% 20%, rgba(67,97,238,0.2) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(114,9,183,0.15) 0%, transparent 50%), linear-gradient(135deg, #05050f 0%, #0a0a1e 50%, #0f051a 100%)",
    borderGradient:
      "linear-gradient(135deg, #4361EE 0%, transparent 40%, transparent 60%, #7209B7 100%)",
    particleColor: "#4361EE",
    tileColor: "#3A56D4",
    word: "TERMINAL",
  },
  {
    index: 5,
    codename: "ANARCHY",
    designation: "Earth-65",
    tagline: "Break every rule they said was permanent.",
    primary: "#9B5DE5",
    secondary: "#F72585",
    glow: "rgba(155, 93, 229, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 40% 30%, rgba(155,93,229,0.2) 0%, transparent 50%), radial-gradient(ellipse at 60% 70%, rgba(247,37,133,0.15) 0%, transparent 50%), linear-gradient(135deg, #0a050f 0%, #10051a 50%, #0f0510 100%)",
    borderGradient:
      "linear-gradient(135deg, #9B5DE5 0%, transparent 40%, transparent 60%, #F72585 100%)",
    particleColor: "#9B5DE5",
    tileColor: "#7B2FBE",
    word: "OVERFLOW",
  },
  {
    index: 6,
    codename: "SMASH",
    designation: "Earth-1610",
    tagline: "From the block to the skyline — unstoppable.",
    primary: "#FF006E",
    secondary: "#DC2626",
    glow: "rgba(255, 0, 110, 0.4)",
    bgGradient:
      "radial-gradient(ellipse at 30% 40%, rgba(255,0,110,0.2) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(220,38,38,0.15) 0%, transparent 50%), linear-gradient(135deg, #0a0508 0%, #1a050a 50%, #0a0505 100%)",
    borderGradient:
      "linear-gradient(135deg, #FF006E 0%, transparent 40%, transparent 60%, #DC2626 100%)",
    particleColor: "#FF006E",
    tileColor: "#D90066",
    word: "DECODING",
  },
  {
    index: 7,
    codename: "GHOST",
    designation: "Earth-90214",
    tagline: "Some truths only surface in the silence.",
    primary: "#E0E0E0",
    secondary: "#666666",
    glow: "rgba(224, 224, 224, 0.25)",
    bgGradient:
      "radial-gradient(ellipse at 50% 30%, rgba(224,224,224,0.08) 0%, transparent 50%), radial-gradient(ellipse at 30% 70%, rgba(100,100,100,0.06) 0%, transparent 40%), linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #0d0d0d 100%)",
    borderGradient:
      "linear-gradient(135deg, #E0E0E0 0%, transparent 40%, transparent 60%, #666666 100%)",
    particleColor: "#999999",
    tileColor: "#B0B0B0",
    word: "PROTOCOL",
  },
];
