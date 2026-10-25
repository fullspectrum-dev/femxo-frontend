import Link from "next/link";
import { buttonClasses, EmptyState } from "@femxo/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="We couldn't find that page"
      message="It may have moved, or the link may be wrong."
      action={
        <Link href="/" className={buttonClasses()}>
          Back to the store
        </Link>
      }
    />
  );
}
