"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SearchBox } from "./SearchBox";

/** The header's search box, showing the words of the search being viewed (and starting over when they change). */
export function HeaderSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/search" ? (params.get("q") ?? "") : "";
  return <SearchBox key={current} initialValue={current} />;
}
