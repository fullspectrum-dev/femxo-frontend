import { loadTopCategories } from "../categories";
import { BottomBar } from "./BottomBar";
import { CategoryNav } from "./CategoryNav";

/* Server components that read the catalog's top categories. Render them inside <Suspense>: the answer can be short-lived. */

export async function CategoryNavLoader() {
  return <CategoryNav categories={await loadTopCategories()} />;
}

export async function BottomBarLoader() {
  return <BottomBar categories={await loadTopCategories()} />;
}
