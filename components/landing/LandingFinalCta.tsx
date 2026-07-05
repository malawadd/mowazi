import type { LandingStoryFrame } from "@/lib/docsContent";
import { LandingActions } from "./LandingActions";
import { StoryFrame } from "./StoryFrame";

type LandingFinalCtaProps = {
  frame: LandingStoryFrame;
};

export function LandingFinalCta({ frame }: LandingFinalCtaProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--cta" actions={<LandingActions showRiskLink />}>
      <div className="story-cta-band">
        {frame.bullets?.map((bullet, index) => (
          <article
            key={bullet}
            className="story-detail-card story-card-tone-paper"
            data-reveal
            data-delay={`${110 + index * 60}ms`}
          >
            <p className="panel-kicker">Next move 0{index + 1}</p>
            <p>{bullet}</p>
          </article>
        ))}
      </div>
    </StoryFrame>
  );
}
