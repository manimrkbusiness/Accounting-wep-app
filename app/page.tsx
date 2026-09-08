"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type AccountType = "farmer" | "merchant" | "business_owner" | "trader" | "service_provider" | "other";
type TransactionType = "credit" | "debit";
type ContactType = "customer" | "vendor" | "farmer" | "merchant" | "business" | "other";

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  account_type: AccountType;
  business_name: string | null;
};

type Contact = {
  id: number;
  name: string;
  phone: string | null;
  contact_type: ContactType;
  notes: string | null;
};

type Category = {
  id: number;
  user_id: string | null;
  transaction_type: TransactionType;
  name: string;
  industry: string;
};

type LedgerTransaction = {
  id: number;
  contact_id: number | null;
  category_id: number | null;
  transaction_type: TransactionType;
  amount: number;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionForm = {
  id?: number;
  transaction_type: TransactionType;
  amount: string;
  transaction_date: string;
  contact_id: string;
  category_id: string;
  description: string;
  reference_number: string;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);

const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: "farmer", label: "Farmer" },
  { value: "merchant", label: "Merchant" },
  { value: "business_owner", label: "Business owner" },
  { value: "trader", label: "Trader" },
  { value: "service_provider", label: "Service provider" },
  { value: "other", label: "Other" }
];

const contactTypes: Array<{ value: ContactType; label: string }> = [
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "farmer", label: "Farmer" },
  { value: "merchant", label: "Merchant" },
  { value: "business", label: "Business" },
  { value: "other", label: "Other" }
];

const emptyTransactionForm: TransactionForm = {
  transaction_type: "credit",
  amount: "",
  transaction_date: today,
  contact_id: "",
  category_id: "",
  description: "",
  reference_number: "",
  notes: ""
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

function getAuthErrorMessage(caughtError: unknown) {
  const fallbackMessage = "Something went wrong.";

  if (!(caughtError instanceof Error)) {
    return fallbackMessage;
  }

  const message = caughtError.message.toLowerCase();

  if (message.includes("email rate limit")) {
    return "Too many signup emails were sent. Please wait a few minutes, then try again.";
  }

  if (message.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  return caughtError.message || fallbackMessage;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? "";
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("merchant");
  const [businessName, setBusinessName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(emptyTransactionForm);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", contact_type: "customer" as ContactType, notes: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", transaction_type: "debit" as TransactionType, industry: "custom" });
  const [filters, setFilters] = useState({ type: "all", contact: "all", category: "all", from: "", to: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      setContacts([]);
      setCategories([]);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [profileResult, contactsResult, categoriesResult, transactionsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", activeSession.user.id).maybeSingle(),
      supabase.from("contacts").select("*").order("name", { ascending: true }),
      supabase.from("categories").select("*").order("transaction_type", { ascending: true }).order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select("*")
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .order("id", { ascending: false })
    ]);

    if (profileResult.error) {
      setError(profileResult.error.message);
    } else {
      setProfile(profileResult.data as Profile | null);
    }

    if (contactsResult.error) {
      setError(contactsResult.error.message);
    } else {
      setContacts((contactsResult.data ?? []) as Contact[]);
    }

    if (categoriesResult.error) {
      setError(categoriesResult.error.message);
    } else {
      setCategories((categoriesResult.data ?? []) as Category[]);
    }

    if (transactionsResult.error) {
      setError(transactionsResult.error.message);
    } else {
      setTransactions((transactionsResult.data ?? []) as LedgerTransaction[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      void loadWorkspace(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadWorkspace(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const filteredTransactions = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      const searchable = [
        formatTransactionId(transaction.id),
        transaction.description,
        transaction.reference_number ?? "",
        transaction.notes ?? "",
        contact?.name ?? "",
        contact?.phone ?? "",
        category?.name ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return (
        (filters.type === "all" || transaction.transaction_type === filters.type) &&
        (filters.contact === "all" || transaction.contact_id === Number(filters.contact)) &&
        (filters.category === "all" || transaction.category_id === Number(filters.category)) &&
        (!filters.from || transaction.transaction_date >= filters.from) &&
        (!filters.to || transaction.transaction_date <= filters.to) &&
        (!search || searchable.includes(search))
      );
    });
  }, [categoryById, contactById, filters, transactions]);

  const totals = useMemo(() => {
    const credit = filteredTransactions
      .filter((transaction) => transaction.transaction_type === "credit")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const debit = filteredTransactions
      .filter((transaction) => transaction.transaction_type === "debit")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return {
      credit,
      debit,
      balance: credit - debit,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  const currentCategories = categories.filter((category) => category.transaction_type === transactionForm.transaction_type);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.user || !data.session) {
          throw new Error("Account created, but no session was returned. Check Supabase email confirmation settings.");
        }

        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          full_name: fullName,
          phone: phone || null,
          account_type: accountType,
          business_name: businessName || null
        });

        if (profileError) {
          throw profileError;
        }

        await supabase.auth.signOut();
        setPassword("");
        setMode("signin");
        setMessage("Account created. Sign in with the same email and password.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        throw signInError;
      }

      setPassword("");
      setMessage("Signed in successfully.");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSaving(true);
    setError("");

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      full_name: fullName,
      phone: phone || null,
      account_type: accountType,
      business_name: businessName || null
    });

    setSaving(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setMessage("Profile saved.");
    await loadWorkspace(session);
  }

  async function saveContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSaving(true);
    setError("");

    const { error: contactError } = await supabase.from("contacts").insert({
      user_id: session.user.id,
      name: contactForm.name,
      phone: contactForm.phone || null,
      contact_type: contactForm.contact_type,
      notes: contactForm.notes || null
    });

    setSaving(false);

    if (contactError) {
      setError(contactError.message);
      return;
    }

    setContactForm({ name: "", phone: "", contact_type: "customer", notes: "" });
    setMessage("Contact added.");
    await loadWorkspace(session);
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSaving(true);
    setError("");

    const { error: categoryError } = await supabase.from("categories").insert({
      user_id: session.user.id,
      transaction_type: categoryForm.transaction_type,
      name: categoryForm.name,
      industry: categoryForm.industry || "custom"
    });

    setSaving(false);

    if (categoryError) {
      setError(categoryError.message);
      return;
    }

    setCategoryForm({ name: "", transaction_type: "debit", industry: "custom" });
    setMessage("Category added.");
    await loadWorkspace(session);
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      user_id: session.user.id,
      transaction_type: transactionForm.transaction_type,
      amount: Number(transactionForm.amount),
      transaction_date: transactionForm.transaction_date,
      contact_id: transactionForm.contact_id ? Number(transactionForm.contact_id) : null,
      category_id: transactionForm.category_id ? Number(transactionForm.category_id) : null,
      description: transactionForm.description,
      reference_number: transactionForm.reference_number || null,
      notes: transactionForm.notes || null
    };

    const result = transactionForm.id
      ? await supabase.from("transactions").update(payload).eq("id", transactionForm.id)
      : await supabase.from("transactions").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setTransactionForm(emptyTransactionForm);
    setMessage(transactionForm.id ? "Transaction updated." : "Transaction added.");
    await loadWorkspace(session);
  }

  async function deleteTransaction(id: number) {
    if (!session || !window.confirm(`Delete ${formatTransactionId(id)} from the active ledger? It will stay in audit logs.`)) {
      return;
    }

    setSaving(true);
    setError("");

    const { error: deleteError } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);

    setSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Transaction deleted from active ledger.");
    await loadWorkspace(session);
  }

  function editTransaction(transaction: LedgerTransaction) {
    setTransactionForm({
      id: transaction.id,
      transaction_type: transaction.transaction_type,
      amount: String(transaction.amount),
      transaction_date: transaction.transaction_date,
      contact_id: transaction.contact_id ? String(transaction.contact_id) : "",
      category_id: transaction.category_id ? String(transaction.category_id) : "",
      description: transaction.description,
      reference_number: transaction.reference_number ?? "",
      notes: transaction.notes ?? ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportTransactions() {
    const rows = [
      ["ID", "Date", "Type", "Contact", "Phone", "Category", "Description", "Reference", "Amount", "Notes"],
      ...filteredTransactions.map((transaction) => {
        const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
        const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;

        return [
          formatTransactionId(transaction.id),
          transaction.transaction_date,
          transaction.transaction_type,
          contact?.name ?? "",
          contact?.phone ?? "",
          category?.name ?? "",
          transaction.description,
          transaction.reference_number ?? "",
          String(transaction.amount),
          transaction.notes ?? ""
        ];
      })
    ];

    downloadCsv(`accounting-export-${today}.csv`, rows);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setMessage("Signed out.");
  }

  if (loading) {
    return (
      <main className="page-shell">
        <section className="auth-panel">
          <span className="eyebrow">Accounting Web App</span>
          <h1>Loading workspace</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    const isSignup = mode === "signup";

    return (
      <main className="page-shell">
        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="brand-block">
            <span className="eyebrow">Accounting Web App</span>
            <h1 id="auth-title">{isSignup ? "Create your account" : "Sign in"}</h1>
            <p>{isSignup ? "Choose your business type and create a private ledger." : "Use your email and password to continue."}</p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {isSignup ? (
              <>
                <label>
                  Full name
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
                </label>
                <label>
                  Phone
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
                </label>
                <label>
                  Account type
                  <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
                    {accountTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Business or farm name
                  <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
                </label>
              </>
            ) : null}
            <label>
              Email
              <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </label>
            <label>
              Password
              <input
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {message ? <p className="status-message">{message}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}
            <button disabled={saving} type="submit">
              {saving ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            className="link-button"
            type="button"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError("");
              setMessage("");
            }}
          >
            {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page-shell">
        <section className="auth-panel">
          <div className="brand-block">
            <span className="eyebrow">Finish setup</span>
            <h1>Create your ledger profile</h1>
          </div>
          <form className="auth-form" onSubmit={saveProfile}>
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </label>
            <label>
              Account type
              <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
                {accountTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={saving} type="submit">
              Save profile
            </button>
            {error ? <p className="error-message">{error}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Accounting Web App</span>
          <h1>{profile.business_name || profile.full_name}</h1>
          <p>{accountTypes.find((type) => type.value === profile.account_type)?.label} ledger</p>
        </div>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      {message ? <p className="status-message">{message}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      <section className="metrics-grid" aria-label="Ledger summary">
        <article>
          <span>Total credit</span>
          <strong>{formatCurrency(totals.credit)}</strong>
        </article>
        <article>
          <span>Total debit</span>
          <strong>{formatCurrency(totals.debit)}</strong>
        </article>
        <article>
          <span>Balance</span>
          <strong className={totals.balance >= 0 ? "positive" : "negative"}>{formatCurrency(totals.balance)}</strong>
        </article>
        <article>
          <span>Records</span>
          <strong>{totals.count}</strong>
        </article>
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveTransaction}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{transactionForm.id ? formatTransactionId(transactionForm.id) : "New transaction"}</span>
              <h2>{transactionForm.id ? "Edit transaction" : "Add credit or debit"}</h2>
            </div>
            {transactionForm.id ? (
              <button className="secondary-button" type="button" onClick={() => setTransactionForm(emptyTransactionForm)}>
                Cancel
              </button>
            ) : null}
          </div>
          <div className="segmented">
            <button
              className={transactionForm.transaction_type === "credit" ? "active" : ""}
              type="button"
              onClick={() => setTransactionForm((form) => ({ ...form, transaction_type: "credit", category_id: "" }))}
            >
              Credit
            </button>
            <button
              className={transactionForm.transaction_type === "debit" ? "active" : ""}
              type="button"
              onClick={() => setTransactionForm((form) => ({ ...form, transaction_type: "debit", category_id: "" }))}
            >
              Debit
            </button>
          </div>
          <div className="form-grid">
            <label>
              Amount
              <input
                min="0.01"
                onChange={(event) => setTransactionForm((form) => ({ ...form, amount: event.target.value }))}
                required
                step="0.01"
                type="number"
                value={transactionForm.amount}
              />
            </label>
            <label>
              Date
              <input
                onChange={(event) => setTransactionForm((form) => ({ ...form, transaction_date: event.target.value }))}
                required
                type="date"
                value={transactionForm.transaction_date}
              />
            </label>
            <label>
              Customer or vendor
              <select value={transactionForm.contact_id} onChange={(event) => setTransactionForm((form) => ({ ...form, contact_id: event.target.value }))}>
                <option value="">No contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select value={transactionForm.category_id} onChange={(event) => setTransactionForm((form) => ({ ...form, category_id: event.target.value }))}>
                <option value="">No category</option>
                {currentCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <input
              onChange={(event) => setTransactionForm((form) => ({ ...form, description: event.target.value }))}
              placeholder="Example: Wheat purchase, fertilizer expense, customer payment"
              required
              value={transactionForm.description}
            />
          </label>
          <label>
            Reference number
            <input
              onChange={(event) => setTransactionForm((form) => ({ ...form, reference_number: event.target.value }))}
              placeholder="Bill number, purchase ID, or manual note"
              value={transactionForm.reference_number}
            />
          </label>
          <label>
            Notes
            <textarea onChange={(event) => setTransactionForm((form) => ({ ...form, notes: event.target.value }))} value={transactionForm.notes} />
          </label>
          <button disabled={saving} type="submit">
            {saving ? "Saving..." : transactionForm.id ? "Update transaction" : "Add transaction"}
          </button>
        </form>

        <aside className="side-stack">
          <form className="tool-panel" onSubmit={saveContact}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Contacts</span>
                <h2>Add customer or vendor</h2>
              </div>
            </div>
            <label>
              Name
              <input value={contactForm.name} onChange={(event) => setContactForm((form) => ({ ...form, name: event.target.value }))} required />
            </label>
            <div className="form-grid">
              <label>
                Phone
                <input inputMode="tel" value={contactForm.phone} onChange={(event) => setContactForm((form) => ({ ...form, phone: event.target.value }))} />
              </label>
              <label>
                Type
                <select value={contactForm.contact_type} onChange={(event) => setContactForm((form) => ({ ...form, contact_type: event.target.value as ContactType }))}>
                  {contactTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button disabled={saving} type="submit">
              Add contact
            </button>
          </form>

          <form className="tool-panel" onSubmit={saveCategory}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Categories</span>
                <h2>Create category</h2>
              </div>
            </div>
            <label>
              Category name
              <input value={categoryForm.name} onChange={(event) => setCategoryForm((form) => ({ ...form, name: event.target.value }))} required />
            </label>
            <div className="form-grid">
              <label>
                Type
                <select
                  value={categoryForm.transaction_type}
                  onChange={(event) => setCategoryForm((form) => ({ ...form, transaction_type: event.target.value as TransactionType }))}
                >
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
              </label>
              <label>
                Group
                <input value={categoryForm.industry} onChange={(event) => setCategoryForm((form) => ({ ...form, industry: event.target.value }))} />
              </label>
            </div>
            <button disabled={saving} type="submit">
              Add category
            </button>
          </form>
        </aside>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Ledger</span>
            <h2>Transaction history</h2>
          </div>
          <button type="button" onClick={exportTransactions}>
            Download CSV
          </button>
        </div>

        <div className="filters-grid">
          <label>
            Search
            <input value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="ID, name, phone, note" />
          </label>
          <label>
            Type
            <select value={filters.type} onChange={(event) => setFilters((value) => ({ ...value, type: event.target.value }))}>
              <option value="all">All</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </label>
          <label>
            Contact
            <select value={filters.contact} onChange={(event) => setFilters((value) => ({ ...value, contact: event.target.value }))}>
              <option value="all">All</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={filters.category} onChange={(event) => setFilters((value) => ({ ...value, category: event.target.value }))}>
              <option value="all">All</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} />
          </label>
          <label>
            To
            <input type="date" value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => {
                const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
                const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;

                return (
                  <tr key={transaction.id}>
                    <td>
                      <a href={`/transactions/${transaction.id}`}>{formatTransactionId(transaction.id)}</a>
                    </td>
                    <td>{transaction.transaction_date}</td>
                    <td>
                      <span className={`pill ${transaction.transaction_type}`}>{transaction.transaction_type}</span>
                    </td>
                    <td>{contact ? `${contact.name}${contact.phone ? ` (${contact.phone})` : ""}` : "-"}</td>
                    <td>{category?.name ?? "-"}</td>
                    <td>{transaction.description}</td>
                    <td className={transaction.transaction_type === "credit" ? "positive" : "negative"}>{formatCurrency(Number(transaction.amount))}</td>
                    <td>
                      <div className="row-actions">
                        <button className="secondary-button" type="button" onClick={() => editTransaction(transaction)}>
                          Edit
                        </button>
                        <button className="danger-button" type="button" onClick={() => deleteTransaction(transaction.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTransactions.length === 0 ? <p className="empty-state">No transactions match the current filters.</p> : null}
        </div>
      </section>
    </main>
  );
}
