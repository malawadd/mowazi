import AgentBackendLab from "@/components/agent-lab/AgentBackendLab";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Agent Backend Lab | Moeazi",
  description: "Exercise the Moeazi agent backend and inspect its visualization contracts.",
};

export default function AgentLabPage() {
  if (process.env.AGENT_LAB_ENABLED !== "true") notFound();
  return <AgentBackendLab />;
}
