import type { Metadata } from "next";
import { ResearchWorkspace } from "../../../components/research-workspace";

export const metadata: Metadata = {
  title: "Research workspace"
};

export default async function ResearchPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResearchWorkspace runId={id} />;
}
