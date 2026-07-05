"use client";

import Link from "next/link";

type LandingActionsProps = {
  showRiskLink?: boolean;
};

export function LandingActions({ showRiskLink = false }: LandingActionsProps) {
  return (
    <div className="story-action-group">
      <Link href="/sign-in" className="primary-button">
        Create account
      </Link>

      <Link href="/dashboard" className="primary-button">
        Open dashboard
      </Link>

      <Link href="/docs" className="secondary-button">
        Read the docs
      </Link>

      {showRiskLink ? (
        <Link href="/docs/risks-and-limitations" className="secondary-button">
          Read the risks
        </Link>
      ) : null}

      <Link href="/sign-in" className="secondary-button">
        Sign in
      </Link>
    </div>
  );
}
