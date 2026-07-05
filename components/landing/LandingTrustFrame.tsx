import Link from "next/link";
import type { LandingStoryFrame, LandingTrustColumn } from "@/lib/docsContent";
import { StoryFrame } from "./StoryFrame";

type LandingTrustFrameProps = {
  frame: LandingStoryFrame;
  columns: readonly LandingTrustColumn[];
};

export function LandingTrustFrame({ frame, columns }: LandingTrustFrameProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--trust">
      <div className="story-trust-grid">
        {columns.map((column, index) => (
          <article
            key={column.id}
            className={`story-trust-card story-card-tone-${column.tone}`}
            data-reveal
            data-delay={`${110 + index * 80}ms`}
          >
            <p className="panel-kicker">{column.title}</p>
            <p className="story-trust-copy">{column.body}</p>
            <ul className="story-list">
              {column.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="story-link-row" data-reveal data-delay="280ms">
        <Link href="/docs/risks-and-limitations" className="secondary-button">
          Read risks and limitations
        </Link>
      </div>
    </StoryFrame>
  );
}
