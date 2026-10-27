import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  GitFork,
  Heart,
  LockKeyhole,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";

const icon = { "aria-hidden": true } as const;
export const REPOSITORY = "https://github.com/bilimgram/kadr";
export const DOWNLOADS = `${REPOSITORY}/releases/latest`;

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Kadr home">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="36" height="36" />
        <span>
          kadr<span className="brand__period">.</span>
        </span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#why-kadr">Why Kadr</a>
        <a href={REPOSITORY} className="github-link">
          <GitFork {...icon} /> <span>GitHub</span>
          <ArrowRight {...icon} />
        </a>
      </nav>
      <a className="desktop-link" href={DOWNLOADS}>
        <Download {...icon} /> Get desktop app
      </a>
    </header>
  );
}

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow">
          <span className="status-dot" /> YOUR IDEAS. PRESS RECORD.
        </p>
        <h1 id="hero-title">
          Show it.
          <br />
          <span>Make it click.</span>
        </h1>
        <p className="hero__description">
          A quick walkthrough. A thoughtful update. That thing that’s easier to show. Turn your
          screen and your voice into a video with Kadr.
        </p>
        <div className="hero__actions">
          <a className="action-link action-link--primary" href="#studio">
            <Video {...icon} /> Make your first video <ArrowDown {...icon} />
          </a>
          <span className="hero__aside">
            Free to use.
            <br />
            Yours to keep.
          </span>
        </div>
        <div className="hero__promises">
          <span>
            <Check {...icon} /> No sign-up
          </span>
          <span>
            <Check {...icon} /> No watermark
          </span>
          <span>
            <Check {...icon} /> No upload
          </span>
        </div>
      </div>
      <aside className="hero-note" aria-label="A simpler way to explain">
        <div className="hero-note__top">
          <span className="tiny-logo">
            <Video {...icon} />
          </span>
          <span>A LITTLE VIDEO GOES A LONG WAY</span>
          <Sparkles {...icon} />
        </div>
        <p>
          “Let me
          <br />
          <em>show you.</em>”
        </p>
        <div className="hero-note__bottom">
          <span className="waveform" aria-hidden="true">
            {[5, 13, 19, 8, 22, 16, 25, 9, 17, 7, 14, 11, 20, 15, 6].map((height) => (
              <i key={height} style={{ height }} />
            ))}
          </span>
          <span>
            Less back-and-forth.
            <br />A little more human.
          </span>
        </div>
      </aside>
    </section>
  );
}

const STEPS = [
  {
    number: "01",
    title: "Pick what to show.",
    text: "Choose a browser tab, a window, or your whole screen. Add your camera if you like.",
    icon: MonitorPlay,
  },
  {
    number: "02",
    title: "Talk it through.",
    text: "Walk through your idea at your own pace. Pause whenever you need a moment.",
    icon: Video,
  },
  {
    number: "03",
    title: "Save. Send. Done.",
    text: "Download your video, then attach it to a message or upload it wherever your team works.",
    icon: Download,
  },
] as const;

const QUESTIONS = [
  {
    question: "Where do my recordings go?",
    answer:
      "Your video is created in your browser. When you finish, download it to your computer. Kadr does not upload it or keep a cloud copy, so save it before you close or refresh the page.",
  },
  {
    question: "Which browser should I use?",
    answer:
      "Use a recent desktop version of Chrome or Edge for the best experience. Other browsers may limit screen capture, system audio, or video formats. Mobile browsers generally do not support screen recording from a website.",
  },
  {
    question: "Can I send a video link to my team?",
    answer:
      "For now, download the video and share the file using your preferred messaging or storage app. Hosted video links, comments, and team workspaces are on the roadmap.",
  },
  {
    question: "Is it really free?",
    answer:
      "Yes. Kadr’s open-source recorder is free to use, with no sign-up and no watermark. Browser recording length is limited by your device’s available memory, so download important videos promptly.",
  },
  {
    question: "Does Kadr edit my video with AI?",
    answer:
      "Not yet. Trimming, captions, and AI editing are planned. Today, Kadr focuses on a simple recording experience and a video file you control.",
  },
] as const;

export function WebsiteSections() {
  return (
    <>
      <section
        id="how-it-works"
        className="how-section content-section"
        aria-labelledby="how-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">FROM “QUICK QUESTION” TO “GOT IT”</p>
            <h2 id="how-title">Three steps. One clear idea.</h2>
          </div>
          <p>
            No tutorial needed.
            <br />
            You already know how to explain.
          </p>
        </div>
        <div className="steps-grid">
          {STEPS.map(({ number, title, text, icon: Icon }) => (
            <article className="step" key={number}>
              <div className="step__top">
                <span>{number}</span>
                <Icon {...icon} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="why-kadr" className="why-section" aria-labelledby="why-title">
        <div className="why-section__intro">
          <p className="eyebrow">A SMALL TOOL. A DIFFERENT PHILOSOPHY.</p>
          <h2 id="why-title">
            Your screen.
            <br />
            Your story.
            <br />
            <span>Your video.</span>
          </h2>
          <a href={REPOSITORY}>
            Built in the open <ArrowRight {...icon} />
          </a>
        </div>
        <div className="principles">
          <article>
            <span className="principle-icon">
              <LockKeyhole {...icon} />
            </span>
            <div>
              <h3>Private comes standard.</h3>
              <p>
                Your recording stays on your device. No account to create, no video quietly uploaded
                in the background.
              </p>
            </div>
          </article>
          <article>
            <span className="principle-icon">
              <Sparkles {...icon} />
            </span>
            <div>
              <h3>A bubble with personality.</h3>
              <p>
                Pick from eight camera shapes. Make it a circle, a heart, or something a little less
                ordinary.
              </p>
            </div>
          </article>
          <article>
            <span className="principle-icon">
              <GitFork {...icon} />
            </span>
            <div>
              <h3>Open source. Open possibilities.</h3>
              <p>
                Inspect the code, suggest an improvement, or help build what’s next. Licensed under
                Apache 2.0.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="faq-section content-section" aria-labelledby="faq-title">
        <div className="faq-intro">
          <p className="eyebrow">GOOD QUESTIONS</p>
          <h2 id="faq-title">
            A little clarity
            <br />
            before you start.
          </h2>
          <p>
            Still curious?{" "}
            <a href={`${REPOSITORY}/discussions`}>
              Ask the community <ArrowRight {...icon} />
            </a>
          </p>
        </div>
        <div className="faq-list">
          {QUESTIONS.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="desktop-banner" aria-labelledby="desktop-title">
        <span className="desktop-banner__icon">
          <MonitorPlay {...icon} />
        </span>
        <div>
          <p className="eyebrow">TAKE KADR WITH YOU</p>
          <h2 id="desktop-title">One less tab. Same big ideas.</h2>
          <p>Get floating controls and global shortcuts with Kadr for desktop.</p>
        </div>
        <a className="action-link action-link--dark" href={DOWNLOADS}>
          Download the desktop app <ArrowRight {...icon} />
        </a>
      </section>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <a href="#top" className="brand" aria-label="Kadr home">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>kadr.</span>
        </a>
        <p>Clearer ideas. Fewer meetings.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href={REPOSITORY}>Source code</a>
        <a href={`${REPOSITORY}/blob/main/PRIVACY.md`}>Privacy</a>
        <a href={`${REPOSITORY}/issues`}>Feedback</a>
        <span>
          Made with <Heart {...icon} /> by <a href="https://bilimgram.uz">Bilimgram</a>
        </span>
      </nav>
      <p className="preview-note">
        <ShieldCheck {...icon} /> Open source · Early preview
      </p>
    </footer>
  );
}
