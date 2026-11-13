import { redirect } from "next/navigation";

export default async function PanelIndex({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  redirect(`/panel/${panel}/dashboard`);
}
