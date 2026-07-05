import type { LandingStoryFrame, LandingSystemNode } from "@/lib/docsContent";
import { StoryFrame } from "./StoryFrame";

type LandingSystemModelFrameProps = {
  frame: LandingStoryFrame;
  nodes: readonly LandingSystemNode[];
};

export function LandingSystemModelFrame({ frame, nodes }: LandingSystemModelFrameProps) {
  return (
    <StoryFrame frame={frame} className="story-frame--system">
      <div className="story-rail">
        {nodes.map((node, index) => (
          <article
            key={node.title}
            className={`story-node story-card-tone-${node.tone}`}
            data-reveal
            data-delay={`${110 + index * 50}ms`}
          >
            <p className="panel-kicker">{node.label}</p>
            <h3>{node.title}</h3>
            <p>{node.body}</p>
          </article>
        ))}
      </div>

      <div className="story-inline-note story-card-tone-paper" data-reveal data-delay="360ms">
        <p className="panel-kicker">Worker + control plane</p>
        <p>
          The external worker watches markets, acquires short leases, and decides whether an action
          is needed. Convex keeps the encrypted wallet context, signs bounded venue actions, and
          records the resulting state back into the strategy account.
        </p>
      </div>
    </StoryFrame>
  );
}
