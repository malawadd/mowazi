import type { LandingProof, LandingStoryFrame } from "@/lib/docsContent";
import { LandingActions } from "./LandingActions";
import { StoryFrame } from "./StoryFrame";

type LandingHeroProps = {
  frame: LandingStoryFrame;
  proofs: readonly LandingProof[];
};

export function LandingHero({ frame, proofs }: LandingHeroProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--hero" actions={<LandingActions showRiskLink />}>
      <div className="story-proof-grid">
        {proofs.map((proof, index) => (
          <article
            key={proof.label}
            className={`story-proof-card story-card-tone-${proof.tone}`}
            data-reveal
            data-delay={`${120 + index * 70}ms`}
          >
            <p className="panel-kicker">{proof.label}</p>
            <p className="story-proof-value">{proof.value}</p>
            <p>{proof.detail}</p>
          </article>
        ))}
      </div>

      <div className="story-inline-note story-card-tone-paper" data-reveal data-delay="260ms">
        <p className="panel-kicker">Current live route</p>
        <p>
          The current v1 strategy is a LINK/USDC delta-neutral workflow spanning Optimism on the LP
          side and HyperLiquid on the hedge side.
        </p>
      </div>
    </StoryFrame>
  );
}
