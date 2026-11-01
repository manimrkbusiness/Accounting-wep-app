/**
 * Turn a raw database / network error into plain English with a fix hint, shown at the top of
 * the page. Known problems get specific guidance; anything unrecognised is returned unchanged so
 * nothing is hidden.
 */
export function friendlyError(message: string): string {
  const m = (message || "").toLowerCase();
  if (!m) return "Something went wrong. Please try again.";
  if (m.includes("already sold") || m.includes("already wasted"))
    return `${message}\n\nFix: this stock already has sales or wastage against it. Use the Delete button on the whole purchase (Farmer purchase → Delete), which clears its stock, sales and wastage together.`;
  if (m.includes("foreign key") && m.includes("stock_entry_items"))
    return "This purchase has coconuts weighed into stock, so it can't be removed on its own.\n\nFix: use the Delete button on the purchase (Farmer purchase → Delete) — it removes the stock, sales and wastage with it.";
  if (m.includes("foreign key") && m.includes("sale_items"))
    return "This purchase is used in a coconut sale.\n\nFix: delete that sale first (Coconut sales), or use Delete on the purchase, which removes its sales too.";
  if (m.includes("foreign key") && m.includes("husk_sale_items"))
    return "This purchase's husk is used in a husk sale.\n\nFix: delete that husk sale first (Husk sale), or use Delete on the purchase.";
  if (m.includes("foreign key"))
    return `${message}\n\nFix: this record is linked to others — delete the linked records (stock, sales) first.`;
  if (m.includes("duplicate key") || m.includes("already exists") || m.includes("23505"))
    return "That already exists. Change the value and try again.";
  if (m.includes("not found") || m.includes("no_data_found"))
    return "That record was not found — it may already have been deleted. Refresh the page.";
  if (m.includes("permission") || m.includes("row-level security") || m.includes("rls") || m.includes("jwt"))
    return "You don't have permission to do that, or your session expired. Try signing in again.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("networkerror"))
    return "Network problem reaching the server. Check your connection and try again.";
  return message;
}
