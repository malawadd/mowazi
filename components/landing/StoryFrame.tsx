import type { PropsWithChildren, ReactNode } from "react";
import type { LandingStoryFrame } from "@/lib/docsContent";

type StoryFrameProps = PropsWithChildren<{
  frame: LandingStoryFrame;
  className?: string;
  actions?: ReactNode;
}>;

export function StoryFrame({ frame, className = "", actions, children }: StoryFrameProps) {
  const classes = ["story-frame", `story-tone-${frame.tone}`, className].filter(Boolean).join(" ");

  return (
    <section className={classes} data-reveal>
      <div className="story-frame-head" data-reveal data-delay="0ms">
        <p className="panel-kicker story-frame-kicker">{frame.kicker}</p>
        <h2 className="story-frame-title">{frame.title}</h2>
      </div>

      <div className="story-frame-body">
        <div className="story-frame-intro" data-reveal data-delay="80ms">
          <p className="story-frame-copy">{frame.body}</p>
          {actions ? <div className="story-frame-actions">{actions}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
