// The subscription price SHOWN on screen. The amount actually charged always comes from the Razorpay
// plan (RAZORPAY_PLAN_ID) — this never sets a rupee amount. Keeping it in NEXT_PUBLIC_PLAN_PRICE lets
// a cheap test plan (e.g. ₹5) and the real ₹519 plan each display the right price after a redeploy.
export const PLAN_PRICE = (process.env.NEXT_PUBLIC_PLAN_PRICE ?? "519").trim();
export const PLAN_PRICE_LABEL = `₹${PLAN_PRICE}`;
