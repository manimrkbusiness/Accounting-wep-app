"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../supabaseClient";

type Contact = {
  id: number;
  name: string;
  phone: string | null;
  contact_type: string;
};

type Category = {
  id: number;
  name: string;
  transaction_type: string;
};

type LedgerTransaction = {
  id: number;
  contact_id: number | null;
  category_id: number | null;
  workflow_type: string;
  product_type: string | null;
  quantity: number | null;
  unit: string;
  rate: number | null;
  logistics_cost: number;
  advance_amount: number;
  payment_status: string;
  payment_method: string;
  stock_status: string | null;
  stock_lot_id: number | null;
  warehouse_name: string | null;
  quality_status: string | null;
  transaction_type: "credit" | "debit";
  amount: number;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AuditLog = {
  id: number;
  action: string;
  created_at: string;
};

const workflowLabels: Record<string, string> = {
  purchase: "Farmer purchase",
  sale: "Sale",
  expense: "Expense",
  income: "Income",
  advance: "Advance"
};

const productLabels: Record<string, string> = {
  green_coconut: "Green coconut",
  brown_coconut: "Brown coconut",
  black_coconut: "Black coconut",
  copra: "Copra",
  other: "Other product"
};

const paymentLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid"
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  upi: "UPI",
  credit_account: "Credit account",
  other: "Other"
};

const qualityLabels: Record<string, string> = {
  fresh: "Fresh",
  good: "Good",
  aging: "Aging",
  damaged: "Damaged"
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatTransactionId(id: number) {
  return `TXN-${String(id).padStart(6, "0")}`;
}

export default function TransactionDetail() {
  const params = useParams<{ id: string }>();
  const transactionId = Number(params.id);
  const [session, setSession] = useState<Session | null>(null);
  const [transaction, setTransaction] = useState<LedgerTransaction | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      if (!data.session || !transactionId) {
        setLoading(false);
        return;
      }

      const { data: transactionData, error: transactionError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (transactionError) {
        setError(transactionError.message);
        setLoading(false);
        return;
      }

      if (!transactionData) {
        setLoading(false);
        return;
      }

      const typedTransaction = transactionData as LedgerTransaction;
      setTransaction(typedTransaction);

      const [contactResult, categoryResult, auditResult] = await Promise.all([
        typedTransaction.contact_id ? supabase.from("contacts").select("*").eq("id", typedTransaction.contact_id).maybeSingle() : Promise.resolve({ data: null }),
        typedTransaction.category_id ? supabase.from("categories").select("*").eq("id", typedTransaction.category_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("audit_logs").select("id, action, created_at").eq("table_name", "transactions").eq("record_id", String(transactionId)).order("created_at", { ascending: false })
      ]);

      setContact((contactResult.data ?? null) as Contact | null);
      setCategory((categoryResult.data ?? null) as Category | null);

      if ("error" in auditResult && auditResult.error) {
        setError(auditResult.error.message);
      } else {
        setAuditLogs((auditResult.data ?? []) as AuditLog[]);
      }

      setLoading(false);
    });
  }, [transactionId]);

  const title = useMemo(() => (transaction ? formatTransactionId(transaction.id) : "Transaction"), [transaction]);

  if (loading) {
    return (
      <main className="page-shell">
        <section className="auth-panel">
          <h1>Loading transaction</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page-shell">
        <section className="auth-panel">
          <h1>Sign in required</h1>
          <p>This transaction is private to the account that created it.</p>
          <a className="button-link" href="/">
            Go to sign in
          </a>
        </section>
      </main>
    );
  }

  if (!transaction) {
    return (
      <main className="page-shell">
        <section className="auth-panel">
          <h1>Transaction not found</h1>
          <p>It may not exist, or it may belong to another account.</p>
          <a className="button-link" href="/">
            Back to dashboard
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell detail-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Transaction detail</span>
          <h1>{title}</h1>
          <p>Private ledger record</p>
        </div>
        <a className="button-link" href="/">
          Back to dashboard
        </a>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="detail-grid">
        <article className="tool-panel">
          <span className={`pill ${transaction.transaction_type}`}>{transaction.transaction_type}</span>
          <h2>{transaction.description}</h2>
          <dl>
            <div>
              <dt>Workflow</dt>
              <dd>{workflowLabels[transaction.workflow_type] ?? transaction.workflow_type}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatCurrency(Number(transaction.amount))}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{transaction.transaction_date}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{contact ? `${contact.name}${contact.phone ? `, ${contact.phone}` : ""}` : "-"}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{category?.name ?? "-"}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>{transaction.product_type ? productLabels[transaction.product_type] ?? transaction.product_type : "-"}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{transaction.quantity ? `${transaction.quantity} ${transaction.unit}` : "-"}</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>{transaction.rate ? formatCurrency(Number(transaction.rate)) : "-"}</dd>
            </div>
            <div>
              <dt>Logistics cost</dt>
              <dd>{formatCurrency(Number(transaction.logistics_cost ?? 0))}</dd>
            </div>
            <div>
              <dt>Advance</dt>
              <dd>{formatCurrency(Number(transaction.advance_amount ?? 0))}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>
                {paymentLabels[transaction.payment_status] ?? transaction.payment_status} / {paymentMethodLabels[transaction.payment_method] ?? transaction.payment_method}
              </dd>
            </div>
            <div>
              <dt>Stock</dt>
              <dd>{transaction.stock_status ? transaction.stock_status.replace("_", " ") : "-"}</dd>
            </div>
            <div>
              <dt>Stock lot</dt>
              <dd>{transaction.stock_lot_id ? `LOT-${String(transaction.stock_lot_id).padStart(5, "0")}` : "-"}</dd>
            </div>
            <div>
              <dt>Warehouse</dt>
              <dd>{transaction.warehouse_name || "-"}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>{transaction.quality_status ? qualityLabels[transaction.quality_status] ?? transaction.quality_status : "-"}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{transaction.reference_number || "-"}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{transaction.notes || "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="tool-panel">
          <span className="eyebrow">Audit trail</span>
          <h2>Record activity</h2>
          <div className="audit-list">
            {auditLogs.map((log) => (
              <div key={log.id}>
                <strong>{log.action}</strong>
                <span>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
            {auditLogs.length === 0 ? <p>No audit events found for this record.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
