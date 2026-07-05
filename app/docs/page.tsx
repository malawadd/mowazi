import DocsPage from "@/components/DocsPage";
import { getDocsMetadata } from "@/lib/docsContent";

export const metadata = getDocsMetadata("overview");

export default function DocsOverviewPage() {
  return <DocsPage slug="overview" />;
}
