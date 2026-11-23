import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import * as data from "./data";

/** The authenticated trader id, injected by withMcpAuth into ctx.http.authInfo.extra. */
function traderOf(ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }): string {
  const id = ctx?.http?.authInfo?.extra?.traderId;
  if (typeof id !== "string" || !id) throw new Error("Not authorized.");
  return id;
}

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const err = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_dashboard_summary",
    { title: "Dashboard summary", description: "Totals for the signed-in trader: purchases, sales, money receivable from buyers, money payable to farmers, and unpaid costs.", inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async (_args, extra) => { try { return ok(await data.dashboardSummary(traderOf(extra))); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "list_farmers",
    { title: "List farmers", description: "List this trader's farmers with their locations and the balance still owed to each. Optional text search by name or phone.", inputSchema: z.object({ search: z.string().optional(), limit: z.number().int().positive().max(200).optional() }), annotations: { readOnlyHint: true } },
    async (args, extra) => { try { return ok(await data.listFarmers(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "list_purchases",
    { title: "List coconut purchases", description: "List purchases (coconut bought from farmers), newest first. Optionally filter by farmerId and a trade_date range (YYYY-MM-DD). Fields: total_amount is the NET payable to the farmer (coconut value + husk credit − labour deductions, so it can differ from weight×rate). balance_amount is the original balance; paid_to_farmer is what has since been paid; outstanding_to_farmer is the true amount STILL owed — use that, not balance_amount. The numeric id goes to record_farmer_payment.", inputSchema: z.object({ farmerId: z.number().int().optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().positive().max(200).optional() }), annotations: { readOnlyHint: true } },
    async (args, extra) => { try { return ok(await data.listPurchases(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "list_sales",
    { title: "List sales", description: "List sales to buyers, newest first. Optionally filter by kind (coconut|husk) and a sale_date range (YYYY-MM-DD). The numeric id is used by record_buyer_receipt.", inputSchema: z.object({ kind: z.enum(["coconut", "husk"]).optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().positive().max(200).optional() }), annotations: { readOnlyHint: true } },
    async (args, extra) => { try { return ok(await data.listSales(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "list_buyers",
    { title: "List buyers", description: "List this trader's buyers (coconut and husk).", inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async (_args, extra) => { try { return ok(await data.listBuyers(traderOf(extra))); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "get_pending_payments",
    { title: "Pending payments", description: "Money to receive from coconut and husk buyers, and money to pay farmers and for unpaid costs (by category).", inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async (_args, extra) => { try { return ok(await data.pendingPayments(traderOf(extra))); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "get_harvest_reminders",
    { title: "Harvest reminders", description: "Each farmer and when their next coconut harvest is due (last harvest + their cycle). Set onlyDue=true for those due within 3 days or already overdue.", inputSchema: z.object({ onlyDue: z.boolean().optional() }), annotations: { readOnlyHint: true } },
    async (args, extra) => { try { return ok(await data.harvestReminders(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  // --- Writes (the assistant confirms each with the user before calling) ---
  server.registerTool(
    "add_farmer",
    { title: "Add a farmer", description: "Create a new farmer in this trader's records. Confirm the name, phone and location with the user before calling.", inputSchema: z.object({ name: z.string(), phone: z.string().describe("10-digit Indian mobile number"), location: z.string().describe("village / town / farm area") }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
    async (args, extra) => { try { return ok(await data.addFarmer(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "record_farmer_payment",
    { title: "Record a payment to a farmer", description: "Record money paid to a farmer against a specific purchase (get the numeric purchase id from list_purchases). Confirm the amount and purchase with the user first.", inputSchema: z.object({ purchase_id: z.number().int(), amount: z.number().positive(), method: z.enum(["cash", "bank", "upi"]).optional(), date: z.string().optional().describe("YYYY-MM-DD, defaults to today"), note: z.string().optional() }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
    async (args, extra) => { try { return ok(await data.recordFarmerPayment(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "record_buyer_receipt",
    { title: "Record a receipt from a buyer", description: "Record money received from a buyer against a specific sale (get the numeric sale id from list_sales). Confirm the amount and sale with the user first.", inputSchema: z.object({ sale_id: z.number().int(), amount: z.number().positive(), method: z.enum(["cash", "bank", "upi"]).optional(), date: z.string().optional().describe("YYYY-MM-DD, defaults to today"), note: z.string().optional() }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
    async (args, extra) => { try { return ok(await data.recordBuyerReceipt(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );

  server.registerTool(
    "add_expense",
    { title: "Add an expense", description: "Record a cost. category is one of: harvesting_labor, dehusking_labor, loading_labor, transport, diesel, vehicle_maintenance, food, husk_handling, other. Confirm with the user first.", inputSchema: z.object({ category: z.string(), amount: z.number().positive(), scope: z.enum(["coconut", "husk", "general"]).optional(), date: z.string().optional().describe("YYYY-MM-DD, defaults to today"), description: z.string().optional() }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
    async (args, extra) => { try { return ok(await data.addExpense(traderOf(extra), args)); } catch (e) { return err((e as Error).message); } }
  );
}
