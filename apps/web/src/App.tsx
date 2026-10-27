import { RecorderStudio } from "./RecorderStudio";
import { Hero, SiteFooter, SiteHeader, WebsiteSections } from "./WebsiteSections";

export function App() {
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
