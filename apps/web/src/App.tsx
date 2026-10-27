import { useEffect } from "react";
import { RecorderStudio } from "./RecorderStudio";
import { Hero, SiteFooter, SiteHeader, WebsiteSections } from "./WebsiteSections";

export function App() {
  useEffect(() => {
    // The initial fragment is resolved before React mounts the target section.
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(window.location.hash.slice(1))
        ?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div id="top" className="site">
      <a className="skip-link" href="#studio">
        Skip to recorder
      </a>
      <SiteHeader />
      <main>
        <Hero />
        <RecorderStudio />
        <WebsiteSections />
      </main>
      <SiteFooter />
    </div>
  );
}
