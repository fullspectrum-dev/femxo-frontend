import type { Metadata } from "next";
import { AddressBookPage } from "@/features/account/components/AddressBookPage";

export const metadata: Metadata = { title: "Your addresses", robots: { index: false } };

export default function Addresses() {
  return <AddressBookPage />;
}
