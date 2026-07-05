import DocsPage from "@/components/DocsPage";
import { getDocsMetadata } from "@/lib/docsContent";

export const metadata = getDocsMetadata("risks-and-limitations");

export default function DocsRisksAndLimitationsPage() {
  return <DocsPage slug="risks-and-limitations" />;
}
