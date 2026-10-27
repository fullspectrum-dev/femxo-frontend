/*
 * The English message catalogue. Components say `t("some.key")` instead of
 * writing the text, so a Hindi catalogue (hi.ts, the same keys) can be added
 * without touching a component. Placeholders are {name}; a message with a
 * count has `_one` and `_other` forms (see tn()).
 */
export const en = {
  // Shell: header, navigation, footer
  "shell.header.home": "Femxo home",
  "shell.header.nav": "Account and cart",
  "shell.header.prime": "Prime",
  "shell.header.account": "Account",
  "shell.header.wishlist": "Wishlist",
  "shell.header.cart": "Cart",
  "nav.breadcrumb": "Breadcrumb",
  "nav.skip": "Skip to content",
  "category.subcategories": "{name} subcategories",
  "product.about": "About this product",
  "product.details": "Details",
  "product.returns": "Returns",
  "product.returnable": "Returnable",
  "product.notReturnable": "Not returnable",
  "product.related": "You may also like",
  "shell.nav.categories": "Shop by category",
  "shell.nav.main": "Main",
  "shell.nav.home": "Home",
  "shell.nav.categoriesButton": "Categories",
  "shell.nav.allCategories": "All categories",
  "shell.footer.prime": "Femxo Prime",
  "shell.footer.help": "Help & support",
  "shell.footer.about": "About Femxo",
  "shell.footer.copyright": "© Femxo Consultancy Services Pvt. Ltd.",

  // Sign in and sign up
  "auth.accountReady": "Your account is ready. Sign in to start shopping.",
  "auth.newHere": "New to Femxo?",
  "auth.createAccountLink": "Create an account",
  "auth.haveAccount": "Already have an account?",
  "auth.signInLink": "Sign in",

  // The cart link in the header
  "cart.link_one": "Cart, {count} item",
  "cart.link_other": "Cart, {count} items",

  // Home
  "home.title": "Femxo store",
  "banners.label": "Offers",
  "banners.slide": "{n} of {total}",
  "banners.prev": "Previous offer",
  "banners.next": "Next offer",
  "banners.goTo": "Show offer {n}",
  "home.deals": "Today's deals",
  "home.primePicks": "Prime picks",
  "home.primeStrip.title": "Femxo Prime",
  "home.primeStrip.text": "Member prices on every product, free delivery on all orders, and coupons only for members. From ₹99 a month.",
  "home.primeStrip.cta": "See Prime plans",

  // Pages that couldn't be shown
  "notFound.title": "We couldn't find that page",
  "notFound.message": "It may have moved, or the link may be wrong.",
  "notFound.cta": "Back to the store",
  "error.title": "Something went wrong",
  "error.message": "We couldn't show this page. Try again, or head back to the store.",
  "error.retry": "Try again",
  "error.home": "Back to the store",
  "error.requestId": "Reference: {id}",
  "offline.title": "You're offline",
  "offline.message": "Check your connection. Pages you've already opened still work, and we'll reconnect on our own.",
  "offline.retry": "Try again",
  "offline.home": "Back to the store",
} as const;

export type MessageKey = keyof typeof en;
