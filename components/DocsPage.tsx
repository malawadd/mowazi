import Link from "next/link";
import {
  docsPages,
  getDocsNeighbors,
  getDocsPage,
  type DocsCalloutTone,
  type DocsPageSlug,
} from "@/lib/docsContent";

function calloutToneClass(tone: DocsCalloutTone) {
  return tone === "warning" ? "docs-callout-warning" : "docs-callout-info";
}

export default function DocsPage({
  slug,
}: {
  slug: DocsPageSlug;
}) {
  const page = getDocsPage(slug);
  const { previous, next } = getDocsNeighbors(slug);
  const startHerePages = docsPages.filter((entry) => entry.slug !== "overview");

  return (
    <main className="docs-shell">
      <section className="hero-panel docs-hero">
        <p className="hero-kicker">{page.kicker}</p>
        <h1>{page.heroTitle}</h1>
        <p className="hero-copy">{page.heroCopy}</p>

        <div className="hero-actions">
          <Link href="/" className="secondary-button">
            Back to home
          </Link>
          <Link
            href={slug === "overview" ? "/docs/how-it-works" : "/docs"}
            className="primary-button"
          >
            {slug === "overview" ? "See how it works" : "Open docs hub"}
          </Link>
        </div>
      </section>

      <div className="docs-layout">
        <aside className="panel docs-rail">
          <div className="panel-body">
            <div className="docs-rail-copy">
              <p className="panel-kicker">Docs map</p>
              <h3>{page.title}</h3>
              <p className="muted-copy">{page.summary}</p>
            </div>

            <nav className="stack-list" aria-label="Docs navigation">
              {docsPages.map((entry) => (
                <Link
                  key={entry.slug}
                  href={entry.href}
                  className={entry.slug === slug ? "nav-item nav-item-active" : "nav-item"}
                >
                  {entry.title}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <div className="docs-main">
          {page.alert ? (
            <section className={`panel docs-callout ${calloutToneClass(page.alert.tone)}`}>
              <div className="panel-body">
                <p className="panel-kicker">Important</p>
                <h3>{page.alert.title}</h3>
                <p className="docs-paragraph">{page.alert.body}</p>
              </div>
            </section>
          ) : null}

          {slug === "overview" ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Start here</p>
                  <h3>Follow the docs in this order if you want the full picture.</h3>
                </div>
              </div>

              <div className="panel-body">
                <div className="marketing-grid">
                  {startHerePages.map((entry) => (
                    <Link key={entry.slug} href={entry.href} className="marketing-card docs-home-card">
                      <p className="panel-kicker">{entry.homePreview.kicker}</p>
                      <h3>{entry.homePreview.title}</h3>
                      <p>{entry.homePreview.body}</p>
                      <span className="docs-read-more">Open guide</span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="panel docs-section">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">{section.title}</p>
                  <h3>{section.summary}</h3>
                </div>
              </div>

              <div className="panel-body">
                <div className="docs-section-copy">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="docs-paragraph">
                      {paragraph}
                    </p>
                  ))}

                  {section.bullets ? (
                    <ul className="docs-bullets">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </section>
          ))}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Next read</p>
                <h3>Keep moving through the docs without guessing where to go next.</h3>
              </div>
            </div>

            <div className="panel-body">
              <div className="docs-next-grid">
                {previous ? (
                  <Link href={previous.href} className="marketing-card docs-home-card">
                    <p className="panel-kicker">Previous</p>
                    <h3>{previous.title}</h3>
                    <p>{previous.summary}</p>
                    <span className="docs-read-more">Go there</span>
                  </Link>
                ) : null}

                {next ? (
                  <Link href={next.href} className="marketing-card docs-home-card">
                    <p className="panel-kicker">Next</p>
                    <h3>{next.title}</h3>
                    <p>{next.summary}</p>
                    <span className="docs-read-more">Go there</span>
                  </Link>
                ) : (
                  <Link href="/docs" className="marketing-card docs-home-card">
                    <p className="panel-kicker">Review</p>
                    <h3>Back to docs overview</h3>
                    <p>Return to the hub if you want to revisit the full reading path.</p>
                    <span className="docs-read-more">Back to overview</span>
                  </Link>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="panel docs-toc">
          <div className="panel-body">
            <p className="panel-kicker">On this page</p>
            <div className="stack-list">
              {page.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="docs-anchor-link">
                  {section.title}
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
