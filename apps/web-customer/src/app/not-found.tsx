import Link from "next/link";
import { buttonClasses, EmptyState } from "@femxo/ui";
import { t } from "@/i18n";

export default function NotFound() {
  return (
    <EmptyState
      title={t("notFound.title")}
      message={t("notFound.message")}
      action={
        <Link href="/" className={buttonClasses()}>
          {t("notFound.cta")}
        </Link>
      }
    />
  );
}
