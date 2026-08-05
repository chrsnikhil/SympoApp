import { UniverseProvider } from "./UniverseContext";
import PortalOverlay from "./PortalOverlay";
import "./universe.css";

export const metadata = {
  title: "Find Your Universe — Spider-Verse Team Router",
  description:
    "Enter your team number, solve the modulo puzzle, and discover which Spider-Verse universe you belong to.",
};

export default function UniverseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UniverseProvider>
      {children}
      <PortalOverlay />
    </UniverseProvider>
  );
}
