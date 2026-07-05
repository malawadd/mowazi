import Link from "next/link";
import type { LandingStoryFrame, LandingSurfaceCard } from "@/lib/docsContent";
import { StoryFrame } from "./StoryFrame";

type LandingSurfaceFrameProps = {
  frame: LandingStoryFrame;
  cards: readonly LandingSurfaceCard[];
};

export function LandingSurfaceFrame({ frame, cards }: LandingSurfaceFrameProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--surface">
      <div className="story-surface-grid">
        {cards.map((card, index) => (
          <article
            key={card.id}
            className={`story-surface-card story-card-tone-${card.tone}`}
            data-reveal
            data-delay={`${100 + index * 35}ms`}
          >
            <p className="panel-kicker">{card.title}</p>
            <h3>{card.question}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>

      <div className="story-link-row" data-reveal data-delay="320ms">
        <Link href="/docs/how-it-works" className="secondary-button">
          Read the system model
        </Link>
        <Link href="/docs/walkthrough" className="secondary-button">
          Read the user walkthrough
        </Link>
      </div>
    </StoryFrame>
  );
}
