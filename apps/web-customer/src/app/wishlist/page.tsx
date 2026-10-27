import type { Metadata } from "next";
import { WishlistPage } from "@/features/wishlist/components/WishlistPage";

export const metadata: Metadata = { title: "Your wishlist", robots: { index: false } };

export default function Wishlist() {
  return <WishlistPage />;
}
