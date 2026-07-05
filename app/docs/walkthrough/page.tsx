import DocsPage from "@/components/DocsPage";
import { getDocsMetadata } from "@/lib/docsContent";

export const metadata = getDocsMetadata("walkthrough");

export default function DocsWalkthroughPage() {
  return <DocsPage slug="walkthrough" />;
}
