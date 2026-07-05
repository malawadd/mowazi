import type { LandingStoryFrame } from "@/lib/docsContent";
import { StoryFrame } from "./StoryFrame";

type LandingProblemFrameProps = {
  frame: LandingStoryFrame;
};

export function LandingProblemFrame({ frame }: LandingProblemFrameProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--problem">
      <div className="story-issue-grid">
        {frame.bullets?.map((bullet, index) => (
          <article
            key={bullet}
            className="story-detail-card story-card-tone-paper"
            data-reveal
            data-delay={`${110 + index * 60}ms`}
          >
            <p className="panel-kicker">Pressure point 0{index + 1}</p>
            <p>{bullet}</p>
          </article>
        ))}
      </div>
    </StoryFrame>
  );
}
