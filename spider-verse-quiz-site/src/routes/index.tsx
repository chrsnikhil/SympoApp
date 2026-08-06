import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import comicPageBg from "@/assets/comic-page-bg.jpg";
import { quizMarkup } from "@/quiz/markup";
import { tailwindConfigSource } from "@/quiz/tailwind-config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spider Sense — Symposium Quiz" },
      {
        name: "description",
        content:
          "A Bronze Age comic-styled tech quiz: enter your team token, get a spider identity, and battle through two timed rounds.",
      },
      { property: "og:title", content: "Spider Sense — Symposium Quiz" },
      {
        property: "og:description",
        content:
          "A Bronze Age comic-styled tech quiz: enter your team token, get a spider identity, and battle through two timed rounds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Anybody:wght@100..900&family=Bricolage+Grotesque:wght@100..900&family=Courier+Prime:wght@100..900&family=Bangers&family=Luckiest+Guy&display=swap",
      },
    ],
  }),
  component: Index,
});

function ComicPageBackground() {
  return (
    <div className="comic-bg" aria-hidden="true">
      <div className="comic-bg__paper" />
      <div className="comic-bg__page" style={{ backgroundImage: `url(${comicPageBg})` }} />
      <div className="comic-bg__misprint" style={{ backgroundImage: `url(${comicPageBg})` }} />
      <div className="comic-bg__halftone" />
      <div className="comic-bg__grain" />
      <div className="comic-bg__center-wash" />
      <div className="comic-bg__vignette" />
    </div>
  );
}

function Index() {
  useEffect(() => {
    const configure = () => {
      const w = window as unknown as { tailwind?: { config?: unknown } };
      if (!w.tailwind) return;
      // eslint-disable-next-line no-new-func
      new Function("tailwind", tailwindConfigSource)(w.tailwind);
    };

    const cdn = document.createElement("script");
    cdn.src = "https://cdn.tailwindcss.com?plugins=forms,container-queries";
    cdn.onload = () => {
      configure();
      const app = document.createElement("script");
      app.src = "/quiz-app.js";
      document.body.appendChild(app);
    };
    document.head.appendChild(cdn);
  }, []);

  return (
    <div className="comic-app">
      <ComicPageBackground />
      <div dangerouslySetInnerHTML={{ __html: quizMarkup }} />
    </div>
  );
}
