import {
  ArrowRight,
  Braces,
  GitBranch,
  ScanSearch,
  ShieldCheck
} from "lucide-react";
import { ResearchLaunch } from "../components/research-launch";

const principles = [
  {
    icon: ScanSearch,
    title: "Research before response",
    detail:
      "Independent source lanes investigate the question before a report is written."
  },
  {
    icon: Braces,
    title: "Claims as structured data",
    detail:
      "Every important statement is atomic, scored, and connected to exact evidence."
  },
  {
    icon: GitBranch,
    title: "Disagreement stays visible",
    detail:
      "Contradictions and contextual differences are analyzed instead of hidden."
  }
];

export default function HomePage() {
  return (
    <main className="landing-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="VeriFact AI home">
          <span className="brand-mark">
            <ShieldCheck size={18} />
          </span>
          <span>VeriFact</span>
          <span className="brand-ai">AI</span>
        </a>
        <div className="header-note">
          <span className="status-dot" />
          Evidence engine online
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <span>Autonomous research system</span>
          <ArrowRight size={14} />
          <span>Inspectable by design</span>
        </div>
        <h1>
          Answers are cheap.
          <br />
          <span>Evidence is the product.</span>
        </h1>
        <p className="hero-copy">
          VeriFact coordinates specialized research agents, verifies atomic
          claims against independent sources, exposes contradictions, and shows
          exactly how confidence was calculated.
        </p>

        <ResearchLaunch />

        <div className="hero-proof">
          <span>Research plan</span>
          <i />
          <span>Source provenance</span>
          <i />
          <span>Claim verification</span>
          <i />
          <span>Explainable confidence</span>
        </div>
      </section>

      <section className="principles-grid" aria-label="Product principles">
        {principles.map(({ icon: Icon, title, detail }, index) => (
          <article className="principle-card" key={title}>
            <div className="principle-number">0{index + 1}</div>
            <Icon size={22} />
            <h2>{title}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <footer className="landing-footer">
        <span>VeriFact AI</span>
        <span>Evidence confidence is not a guarantee of objective truth.</span>
      </footer>
    </main>
  );
}
