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
