import type { Metadata } from "next";
import { PrimePage } from "@/features/prime/components/PrimePage";

export const metadata: Metadata = {
  title: "Femxo Prime",
  description: "Prime prices on everything, free delivery on every order and member-only coupons.",
};

export default function Prime() {
  return <PrimePage />;
}
