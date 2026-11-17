import type { Metadata } from "next";
import { PrimePage } from "@/features/prime/components/PrimePage";

export const metadata: Metadata = {
  title: "Femxo Prime",
  description: "Member prices on the Femxo store.",
};

export default function Prime() {
  return <PrimePage />;
}
