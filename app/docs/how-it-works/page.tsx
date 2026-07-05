import DocsPage from "@/components/DocsPage";
import { getDocsMetadata } from "@/lib/docsContent";

export const metadata = getDocsMetadata("how-it-works");

export default function DocsHowItWorksPage() {
  return <DocsPage slug="how-it-works" />;
}
