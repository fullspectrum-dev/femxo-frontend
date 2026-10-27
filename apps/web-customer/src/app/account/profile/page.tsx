import type { Metadata } from "next";
import { ProfilePage } from "@/features/account/components/ProfilePage";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default function Profile() {
  return <ProfilePage />;
}
