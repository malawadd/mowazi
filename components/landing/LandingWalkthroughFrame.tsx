import Link from "next/link";
import type { LandingStoryFrame, LandingWalkthroughStep } from "@/lib/docsContent";
import { StoryFrame } from "./StoryFrame";

type LandingWalkthroughFrameProps = {
  frame: LandingStoryFrame;
  steps: readonly LandingWalkthroughStep[];
};

export function LandingWalkthroughFrame({ frame, steps }: LandingWalkthroughFrameProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--walkthrough">
      <div className="story-step-grid">
        {steps.map((step, index) => (
          <article
            key={step.step}
            className={`story-step story-card-tone-${step.tone}`}
            data-reveal
            data-delay={`${110 + index * 55}ms`}
          >
            <p className="panel-kicker">Step {step.step}</p>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </div>

      <div className="story-link-row" data-reveal data-delay="320ms">
        <Link href="/docs/walkthrough" className="secondary-button">
          Open the walkthrough
        </Link>
      </div>
    </StoryFrame>
  );
}
