"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type AppSection = "dashboard" | "account" | "add" | "transactions" | "inventory";
type AccountType =
  | "farmer"
  | "trader"
  | "wholesaler"
  | "retailer"
  | "agent_broker"
  | "exporter"
  | "importer"
  | "merchant"
  | "business_owner"
  | "service_provider"
  | "other";
type TransactionType = "credit" | "debit";
type ContactType = "customer" | "vendor" | "farmer" | "merchant" | "business" | "other";
type WorkflowType = "purchase" | "sale" | "expense" | "income" | "advance";
type ProductType = "green_coconut" | "brown_coconut" | "black_coconut" | "copra" | "other";
type PaymentStatus = "paid" | "partial" | "unpaid";
type PaymentMethod = "cash" | "bank" | "upi" | "credit_account" | "other";
type StockStatus = "warehouse" | "direct_sale" | "sold";
type QualityStatus = "fresh" | "good" | "aging" | "damaged";

type Profile = {
  id: string;
  email: string | null;
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
  workflow_type: WorkflowType;
  product_type: ProductType | null;
  quantity: number | null;
  unit: string;
  rate: number | null;
  logistics_cost: number;
  advance_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  stock_status: StockStatus | null;
  warehouse_name: string | null;
  quality_status: QualityStatus | null;
  stock_lot_id: number | null;
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
  workflow_type: WorkflowType;
  transaction_type: TransactionType;
  product_type: ProductType | "";
  quantity: string;
  unit: string;
  rate: string;
  logistics_cost: string;
  advance_amount: string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  stock_status: StockStatus | "";
  warehouse_name: string;
  quality_status: QualityStatus;
  stock_lot_id: string;
  amount: string;
  transaction_date: string;
  contact_id: string;
  category_id: string;
  description: string;
  reference_number: string;
  notes: string;
};

type StockLot = {
  id: number;
  source_transaction_id: number | null;
  product_type: ProductType;
  quantity: number;
  remaining_quantity: number;
  unit: string;
  purchase_rate: number | null;
  warehouse_name: string | null;
  quality_status: QualityStatus;
  status: "in_stock" | "sold_out" | "direct_sale";
  received_date: string;
  notes: string | null;
};

const today = new Date().toISOString().slice(0, 10);

const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: "farmer", label: "Farmer" },
  { value: "trader", label: "Trader" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "retailer", label: "Retailer" },
  { value: "agent_broker", label: "Agent or broker" },
  { value: "exporter", label: "Exporter" },
  { value: "importer", label: "Importer" },
  { value: "merchant", label: "Merchant" },
  { value: "business_owner", label: "Business owner" },
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
  workflow_type: "purchase",
  transaction_type: "debit",
  product_type: "green_coconut",
  quantity: "",
  unit: "pieces",
  rate: "",
  logistics_cost: "",
  advance_amount: "",
  payment_status: "unpaid",
  payment_method: "credit_account",
  stock_status: "warehouse",
  warehouse_name: "",
  quality_status: "fresh",
  stock_lot_id: "",
  amount: "",
  transaction_date: today,
  contact_id: "",
  category_id: "",
  description: "",
  reference_number: "",
  notes: ""
};

const workflowTypes: Array<{ value: WorkflowType; label: string; transactionType: TransactionType }> = [
  { value: "purchase", label: "Farmer purchase", transactionType: "debit" },
  { value: "sale", label: "Sale", transactionType: "credit" },
  { value: "expense", label: "Expense", transactionType: "debit" },
  { value: "income", label: "Income", transactionType: "credit" },
  { value: "advance", label: "Advance", transactionType: "debit" }
];

const productTypes: Array<{ value: ProductType; label: string }> = [
  { value: "green_coconut", label: "Green coconut" },
  { value: "brown_coconut", label: "Brown coconut" },
  { value: "black_coconut", label: "Black coconut" },
  { value: "copra", label: "Copra" },
  { value: "other", label: "Other" }
];

const paymentStatuses: Array<{ value: PaymentStatus; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" }
];

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "credit_account", label: "Credit account" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" }
];

const qualityStatuses: Array<{ value: QualityStatus; label: string }> = [
  { value: "fresh", label: "Fresh" },
  { value: "good", label: "Good" },
  { value: "aging", label: "Aging" },
  { value: "damaged", label: "Damaged" }
];

const stockStatuses: Array<{ value: StockStatus; label: string }> = [
  { value: "warehouse", label: "Send to warehouse" },
  { value: "direct_sale", label: "Direct sale" }
];

const appSections: Array<{ value: AppSection; label: string; shortLabel: string }> = [
  { value: "dashboard", label: "Dashboard", shortLabel: "Home" },
  { value: "account", label: "Account", shortLabel: "Account" },
  { value: "add", label: "Add transaction", shortLabel: "Add" },
  { value: "transactions", label: "View transactions", shortLabel: "Ledger" },
  { value: "inventory", label: "Inventory", shortLabel: "Stock" }
];

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

function getIndianPhoneValue(value: string) {
  return value.replace(/\D/g, "").replace(/^91/, "").slice(0, 10);
}

function getStoredIndianPhone(value: string) {
  const digits = getIndianPhoneValue(value);
  return digits ? `+91${digits}` : null;
}

function isValidIndianPhone(value: string) {
  return /^[6-9]\d{9}$/.test(getIndianPhoneValue(value));
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
  const [accountType, setAccountType] = useState<AccountType>("trader");
  const [businessName, setBusinessName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [stockLots, setStockLots] = useState<StockLot[]>([]);
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
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
      setStockLots([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [profileResult, contactsResult, categoriesResult, transactionsResult, stockLotsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", activeSession.user.id).maybeSingle(),
      supabase.from("contacts").select("*").order("name", { ascending: true }),
      supabase.from("categories").select("*").order("transaction_type", { ascending: true }).order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select("*")
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .order("id", { ascending: false }),
      supabase.from("stock_lots").select("*").order("received_date", { ascending: false }).order("id", { ascending: false })
    ]);

    if (profileResult.error) {
      setError(profileResult.error.message);
    } else {
      const loadedProfile = profileResult.data as Profile | null;
      setProfile(loadedProfile);

      if (loadedProfile) {
        setFullName(loadedProfile.full_name);
        setPhone(loadedProfile.phone ?? "");
        setAccountType(loadedProfile.account_type);
        setBusinessName(loadedProfile.business_name ?? "");
      }
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

    if (stockLotsResult.error) {
      setError(stockLotsResult.error.message);
    } else {
      setStockLots((stockLotsResult.data ?? []) as StockLot[]);
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
  const stockLotById = useMemo(() => new Map(stockLots.map((lot) => [lot.id, lot])), [stockLots]);
  const availableStockLots = stockLots.filter((lot) => lot.status === "in_stock" && Number(lot.remaining_quantity) > 0);

  const filteredTransactions = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      const stockLot = transaction.stock_lot_id ? stockLotById.get(transaction.stock_lot_id) : null;
      const searchable = [
        formatTransactionId(transaction.id),
        transaction.description,
        transaction.workflow_type,
        transaction.product_type ?? "",
        transaction.payment_method,
        transaction.payment_status,
        transaction.warehouse_name ?? "",
        transaction.quality_status ?? "",
        transaction.reference_number ?? "",
        transaction.notes ?? "",
        contact?.name ?? "",
        contact?.phone ?? "",
        category?.name ?? "",
        stockLot ? `LOT-${String(stockLot.id).padStart(5, "0")}` : ""
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
  }, [categoryById, contactById, filters, stockLotById, transactions]);

  const totals = useMemo(() => {
    const credit = filteredTransactions
      .filter((transaction) => transaction.transaction_type === "credit")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const debit = filteredTransactions
      .filter((transaction) => transaction.transaction_type === "debit")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const todayPurchases = transactions
      .filter((transaction) => transaction.workflow_type === "purchase" && transaction.transaction_date === today)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const todaySales = transactions
      .filter((transaction) => transaction.workflow_type === "sale" && transaction.transaction_date === today)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const cashInHand = transactions.reduce((sum, transaction) => {
      if (transaction.payment_method !== "cash" || transaction.payment_status === "unpaid") {
        return sum;
      }

      return transaction.transaction_type === "credit" ? sum + Number(transaction.amount) : sum - Number(transaction.amount);
    }, 0);
    const bankBalance = transactions.reduce((sum, transaction) => {
      if ((transaction.payment_method !== "bank" && transaction.payment_method !== "upi") || transaction.payment_status === "unpaid") {
        return sum;
      }

      return transaction.transaction_type === "credit" ? sum + Number(transaction.amount) : sum - Number(transaction.amount);
    }, 0);
    const stockQuantity = stockLots.reduce((sum, lot) => sum + Number(lot.remaining_quantity), 0);
    const agedStock = stockLots.filter((lot) => {
      const ageInDays = Math.floor((Date.now() - new Date(lot.received_date).getTime()) / 86_400_000);
      return lot.status === "in_stock" && Number(lot.remaining_quantity) > 0 && ageInDays >= 30;
    }).length;

    return {
      credit,
      debit,
      balance: credit - debit,
      count: filteredTransactions.length,
      todayPurchases,
      todaySales,
      cashInHand,
      bankBalance,
      stockQuantity,
      agedStock
    };
  }, [filteredTransactions, stockLots, transactions]);

  const currentCategories = categories.filter((category) => category.transaction_type === transactionForm.transaction_type);

  function updateWorkflowType(workflowType: WorkflowType) {
    const selectedWorkflow = workflowTypes.find((workflow) => workflow.value === workflowType);
    const transactionType = selectedWorkflow?.transactionType ?? "debit";

    setTransactionForm((form) => ({
      ...form,
      workflow_type: workflowType,
      transaction_type: transactionType,
      category_id: "",
      product_type: workflowType === "purchase" || workflowType === "sale" ? form.product_type || "green_coconut" : "",
      stock_status: workflowType === "purchase" ? "warehouse" : "",
      stock_lot_id: workflowType === "sale" ? form.stock_lot_id : ""
    }));
  }

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

        if (!isValidIndianPhone(phone)) {
          throw new Error("Enter a valid 10-digit Indian mobile number.");
        }

        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          email: data.user.email ?? email,
          full_name: fullName,
          phone: getStoredIndianPhone(phone),
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

    if (!isValidIndianPhone(phone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      email: session.user.email ?? email,
      full_name: fullName,
      phone: getStoredIndianPhone(phone),
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

    if ((transactionForm.workflow_type === "purchase" || transactionForm.workflow_type === "sale") && (!transactionForm.product_type || !transactionForm.quantity)) {
      setError("Product type and quantity are required for purchase and sale transactions.");
      setSaving(false);
      return;
    }

    if (transactionForm.workflow_type === "sale" && !transactionForm.stock_lot_id) {
      setError("Select the stock lot being sold.");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: session.user.id,
      workflow_type: transactionForm.workflow_type,
      transaction_type: transactionForm.transaction_type,
      product_type: transactionForm.product_type || null,
      quantity: transactionForm.quantity ? Number(transactionForm.quantity) : null,
      unit: transactionForm.unit || "pieces",
      rate: transactionForm.rate ? Number(transactionForm.rate) : null,
      logistics_cost: transactionForm.logistics_cost ? Number(transactionForm.logistics_cost) : 0,
      advance_amount: transactionForm.advance_amount ? Number(transactionForm.advance_amount) : 0,
      payment_status: transactionForm.payment_status,
      payment_method: transactionForm.payment_method,
      stock_status: transactionForm.stock_status || null,
      warehouse_name: transactionForm.warehouse_name || null,
      quality_status: transactionForm.quality_status || null,
      stock_lot_id: transactionForm.stock_lot_id ? Number(transactionForm.stock_lot_id) : null,
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
    setActiveSection("add");
    setTransactionForm({
      id: transaction.id,
      workflow_type: transaction.workflow_type,
      transaction_type: transaction.transaction_type,
      product_type: transaction.product_type ?? "",
      quantity: transaction.quantity ? String(transaction.quantity) : "",
      unit: transaction.unit,
      rate: transaction.rate ? String(transaction.rate) : "",
      logistics_cost: transaction.logistics_cost ? String(transaction.logistics_cost) : "",
      advance_amount: transaction.advance_amount ? String(transaction.advance_amount) : "",
      payment_status: transaction.payment_status,
      payment_method: transaction.payment_method,
      stock_status: transaction.stock_status ?? "",
      warehouse_name: transaction.warehouse_name ?? "",
      quality_status: transaction.quality_status ?? "fresh",
      stock_lot_id: transaction.stock_lot_id ? String(transaction.stock_lot_id) : "",
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
      [
        "ID",
        "Date",
        "Workflow",
        "Type",
        "Contact",
        "Phone",
        "Category",
        "Product",
        "Quantity",
        "Unit",
        "Rate",
        "Logistics Cost",
        "Advance",
        "Payment Status",
        "Payment Method",
        "Stock Lot",
        "Description",
        "Reference",
        "Amount",
        "Notes"
      ],
      ...filteredTransactions.map((transaction) => {
        const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
        const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;

        return [
          formatTransactionId(transaction.id),
          transaction.transaction_date,
          transaction.workflow_type,
          transaction.transaction_type,
          contact?.name ?? "",
          contact?.phone ?? "",
          category?.name ?? "",
          transaction.product_type ?? "",
          transaction.quantity ? String(transaction.quantity) : "",
          transaction.unit,
          transaction.rate ? String(transaction.rate) : "",
          String(transaction.logistics_cost),
          String(transaction.advance_amount),
          transaction.payment_status,
          transaction.payment_method,
          transaction.stock_lot_id ? `LOT-${String(transaction.stock_lot_id).padStart(5, "0")}` : "",
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
                  Phone number
                  <div className="phone-input">
                    <span aria-hidden="true">{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span>
                    <input
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))}
                      pattern="[6-9][0-9]{9}"
                      placeholder="9876543210"
                      required
                      value={getIndianPhoneValue(phone)}
                    />
                  </div>
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
                  Name of your business
                  <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business, shop, or farm name" />
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
              Phone number
              <div className="phone-input">
                <span aria-hidden="true">{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))}
                  pattern="[6-9][0-9]{9}"
                  placeholder="9876543210"
                  required
                  value={getIndianPhoneValue(phone)}
                />
              </div>
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
              Name of your business
              <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business, shop, or farm name" />
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
    <main className="authenticated-shell">
      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <span className="eyebrow">Accounting Web App</span>
          <strong>{profile.business_name || profile.full_name}</strong>
          <span>{accountTypes.find((type) => type.value === profile.account_type)?.label} ledger</span>
        </div>
        <nav className="sidebar-nav">
          {appSections.map((section) => (
            <button
              className={activeSection === section.value ? "active" : ""}
              key={section.value}
              onClick={() => setActiveSection(section.value)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>
        <button className="secondary-button" type="button" onClick={signOut}>
          Sign out
        </button>
      </aside>

      <div className="app-main">
      <header className="topbar">
        <div>
          <span className="eyebrow">{appSections.find((section) => section.value === activeSection)?.label}</span>
          <h1>{activeSection === "dashboard" ? profile.business_name || profile.full_name : appSections.find((section) => section.value === activeSection)?.label}</h1>
          <p>{activeSection === "dashboard" ? `${accountTypes.find((type) => type.value === profile.account_type)?.label} ledger` : profile.business_name || profile.full_name}</p>
        </div>
        <button className="topbar-signout" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <nav className="mobile-section-nav" aria-label="Sections">
        {appSections.map((section) => (
          <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => setActiveSection(section.value)} type="button">
            {section.shortLabel}
          </button>
        ))}
      </nav>

      {message ? <p className="status-message">{message}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      {activeSection === "account" ? (
        <section className="ledger-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Account</span>
              <h2>Account details</h2>
            </div>
          </div>
          <form className="account-form" onSubmit={saveProfile}>
            <div className="form-grid">
              <label>
                Email
                <input readOnly value={profile.email ?? email} />
              </label>
              <label>
                Full name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label>
                Phone number
                <div className="phone-input">
                  <span aria-hidden="true">{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))}
                    pattern="[6-9][0-9]{9}"
                    placeholder="9876543210"
                    required
                    value={getIndianPhoneValue(phone)}
                  />
                </div>
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
                Name of your business
                <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business, shop, or farm name" />
              </label>
            </div>
            <button disabled={saving} type="submit">
              {saving ? "Saving..." : "Save account"}
            </button>
          </form>
        </section>
      ) : null}

      {activeSection === "dashboard" ? (
        <>
      <section className="metrics-grid" aria-label="Ledger summary">
        <article>
          <span>Today purchases</span>
          <strong>{formatCurrency(totals.todayPurchases)}</strong>
        </article>
        <article>
          <span>Today sales</span>
          <strong>{formatCurrency(totals.todaySales)}</strong>
        </article>
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
          <span>Cash in hand</span>
          <strong className={totals.cashInHand >= 0 ? "positive" : "negative"}>{formatCurrency(totals.cashInHand)}</strong>
        </article>
        <article>
          <span>Bank balance</span>
          <strong className={totals.bankBalance >= 0 ? "positive" : "negative"}>{formatCurrency(totals.bankBalance)}</strong>
        </article>
        <article>
          <span>Stock balance</span>
          <strong>{totals.stockQuantity} pcs</strong>
        </article>
        <article>
          <span>Aged stock alerts</span>
          <strong className={totals.agedStock > 0 ? "negative" : "positive"}>{totals.agedStock}</strong>
        </article>
        <article>
          <span>Records</span>
          <strong>{totals.count}</strong>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="ledger-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Recent</span>
              <h2>Latest transactions</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => setActiveSection("transactions")}>
              View all
            </button>
          </div>
          <div className="summary-list">
            {transactions.slice(0, 5).map((transaction) => (
              <div key={transaction.id}>
                <span>{formatTransactionId(transaction.id)}</span>
                <strong>{transaction.description}</strong>
                <span className={transaction.transaction_type === "credit" ? "positive" : "negative"}>{formatCurrency(Number(transaction.amount))}</span>
              </div>
            ))}
            {transactions.length === 0 ? <p className="empty-state">No transactions yet.</p> : null}
          </div>
        </article>

        <article className="ledger-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Stock</span>
              <h2>Inventory alerts</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => setActiveSection("inventory")}>
              View stock
            </button>
          </div>
          <div className="summary-list">
            {stockLots
              .filter((lot) => {
                const daysInStock = Math.floor((Date.now() - new Date(lot.received_date).getTime()) / 86_400_000);
                return lot.status === "in_stock" && Number(lot.remaining_quantity) > 0 && daysInStock >= 30;
              })
              .slice(0, 5)
              .map((lot) => {
                const daysInStock = Math.floor((Date.now() - new Date(lot.received_date).getTime()) / 86_400_000);
                const productLabel = productTypes.find((product) => product.value === lot.product_type)?.label ?? lot.product_type;

                return (
                  <div key={lot.id}>
                    <span>LOT-{String(lot.id).padStart(5, "0")}</span>
                    <strong>{productLabel}</strong>
                    <span className="negative">{daysInStock} days</span>
                  </div>
                );
              })}
            {totals.agedStock === 0 ? <p className="empty-state">No aged stock alerts.</p> : null}
          </div>
        </article>
      </section>
        </>
      ) : null}

      {activeSection === "add" ? (
      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveTransaction}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{transactionForm.id ? formatTransactionId(transactionForm.id) : "New transaction"}</span>
              <h2>{transactionForm.id ? "Edit transaction" : "Add agri trade entry"}</h2>
            </div>
            {transactionForm.id ? (
              <button className="secondary-button" type="button" onClick={() => setTransactionForm(emptyTransactionForm)}>
                Cancel
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              Workflow
              <select value={transactionForm.workflow_type} onChange={(event) => updateWorkflowType(event.target.value as WorkflowType)}>
                {workflowTypes.map((workflow) => (
                  <option key={workflow.value} value={workflow.value}>
                    {workflow.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <input readOnly value={transactionForm.transaction_type === "credit" ? "Credit" : "Debit"} />
            </label>
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
              Payment status
              <select
                value={transactionForm.payment_status}
                onChange={(event) => setTransactionForm((form) => ({ ...form, payment_status: event.target.value as PaymentStatus }))}
              >
                {paymentStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment method
              <select
                value={transactionForm.payment_method}
                onChange={(event) => setTransactionForm((form) => ({ ...form, payment_method: event.target.value as PaymentMethod }))}
              >
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
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
            {(transactionForm.workflow_type === "purchase" || transactionForm.workflow_type === "sale") ? (
              <>
                <label>
                  Product
                  <select value={transactionForm.product_type} onChange={(event) => setTransactionForm((form) => ({ ...form, product_type: event.target.value as ProductType }))}>
                    {productTypes.map((product) => (
                      <option key={product.value} value={product.value}>
                        {product.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    min="0.01"
                    onChange={(event) => setTransactionForm((form) => ({ ...form, quantity: event.target.value }))}
                    required
                    step="0.01"
                    type="number"
                    value={transactionForm.quantity}
                  />
                </label>
                <label>
                  Unit
                  <input onChange={(event) => setTransactionForm((form) => ({ ...form, unit: event.target.value }))} required value={transactionForm.unit} />
                </label>
                <label>
                  Rate
                  <input
                    min="0"
                    onChange={(event) => setTransactionForm((form) => ({ ...form, rate: event.target.value }))}
                    step="0.01"
                    type="number"
                    value={transactionForm.rate}
                  />
                </label>
              </>
            ) : null}
            {transactionForm.workflow_type === "purchase" ? (
              <>
                <label>
                  Stock movement
                  <select
                    value={transactionForm.stock_status}
                    onChange={(event) => setTransactionForm((form) => ({ ...form, stock_status: event.target.value as StockStatus }))}
                  >
                    {stockStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Warehouse
                  <input
                    onChange={(event) => setTransactionForm((form) => ({ ...form, warehouse_name: event.target.value }))}
                    placeholder="Warehouse or yard name"
                    value={transactionForm.warehouse_name}
                  />
                </label>
                <label>
                  Quality
                  <select
                    value={transactionForm.quality_status}
                    onChange={(event) => setTransactionForm((form) => ({ ...form, quality_status: event.target.value as QualityStatus }))}
                  >
                    {qualityStatuses.map((quality) => (
                      <option key={quality.value} value={quality.value}>
                        {quality.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {transactionForm.workflow_type === "sale" ? (
              <label>
                Stock lot
                <select
                  value={transactionForm.stock_lot_id}
                  onChange={(event) => {
                    const selectedLot = stockLotById.get(Number(event.target.value));
                    setTransactionForm((form) => ({
                      ...form,
                      stock_lot_id: event.target.value,
                      product_type: selectedLot?.product_type ?? form.product_type,
                      unit: selectedLot?.unit ?? form.unit,
                      rate: selectedLot?.purchase_rate ? String(selectedLot.purchase_rate) : form.rate
                    }));
                  }}
                  required
                >
                  <option value="">Select lot</option>
                  {availableStockLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      LOT-{String(lot.id).padStart(5, "0")} - {productTypes.find((product) => product.value === lot.product_type)?.label} - {lot.remaining_quantity} {lot.unit}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Logistics cost
              <input
                min="0"
                onChange={(event) => setTransactionForm((form) => ({ ...form, logistics_cost: event.target.value }))}
                step="0.01"
                type="number"
                value={transactionForm.logistics_cost}
              />
            </label>
            <label>
              Advance
              <input
                min="0"
                onChange={(event) => setTransactionForm((form) => ({ ...form, advance_amount: event.target.value }))}
                step="0.01"
                type="number"
                value={transactionForm.advance_amount}
              />
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
      ) : null}

      {activeSection === "transactions" ? (
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
                <th>Workflow</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Category</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Payment</th>
                <th>Lot</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => {
                const contact = transaction.contact_id ? contactById.get(transaction.contact_id) : null;
                const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
                const productLabel = transaction.product_type ? productTypes.find((product) => product.value === transaction.product_type)?.label : null;

                return (
                  <tr key={transaction.id}>
                    <td>
                      <a href={`/transactions/${transaction.id}`}>{formatTransactionId(transaction.id)}</a>
                    </td>
                    <td>{transaction.transaction_date}</td>
                    <td>{workflowTypes.find((workflow) => workflow.value === transaction.workflow_type)?.label ?? transaction.workflow_type}</td>
                    <td>
                      <span className={`pill ${transaction.transaction_type}`}>{transaction.transaction_type}</span>
                    </td>
                    <td>{contact ? `${contact.name}${contact.phone ? ` (${contact.phone})` : ""}` : "-"}</td>
                    <td>{category?.name ?? "-"}</td>
                    <td>{productLabel ?? "-"}</td>
                    <td>{transaction.quantity ? `${transaction.quantity} ${transaction.unit}` : "-"}</td>
                    <td>
                      <span>{paymentStatuses.find((status) => status.value === transaction.payment_status)?.label}</span>
                      <br />
                      <span className="muted-text">{paymentMethods.find((method) => method.value === transaction.payment_method)?.label}</span>
                    </td>
                    <td>{transaction.stock_lot_id ? `LOT-${String(transaction.stock_lot_id).padStart(5, "0")}` : "-"}</td>
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
      ) : null}

      {activeSection === "inventory" ? (
      <section className="ledger-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Inventory</span>
            <h2>Lot-wise warehouse stock</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lot</th>
                <th>Product</th>
                <th>Received</th>
                <th>Days</th>
                <th>Quantity</th>
                <th>Remaining</th>
                <th>Rate</th>
                <th>Warehouse</th>
                <th>Quality</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stockLots.map((lot) => {
                const daysInStock = Math.floor((Date.now() - new Date(lot.received_date).getTime()) / 86_400_000);
                const productLabel = productTypes.find((product) => product.value === lot.product_type)?.label ?? lot.product_type;

                return (
                  <tr key={lot.id}>
                    <td>
                      {lot.source_transaction_id ? (
                        <a href={`/transactions/${lot.source_transaction_id}`}>LOT-{String(lot.id).padStart(5, "0")}</a>
                      ) : (
                        `LOT-${String(lot.id).padStart(5, "0")}`
                      )}
                    </td>
                    <td>{productLabel}</td>
                    <td>{lot.received_date}</td>
                    <td className={daysInStock >= 30 && lot.status === "in_stock" ? "negative" : ""}>{daysInStock}</td>
                    <td>
                      {lot.quantity} {lot.unit}
                    </td>
                    <td>
                      {lot.remaining_quantity} {lot.unit}
                    </td>
                    <td>{lot.purchase_rate ? formatCurrency(Number(lot.purchase_rate)) : "-"}</td>
                    <td>{lot.warehouse_name || "-"}</td>
                    <td>{qualityStatuses.find((quality) => quality.value === lot.quality_status)?.label}</td>
                    <td>{lot.status.replace("_", " ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stockLots.length === 0 ? <p className="empty-state">No warehouse stock lots yet.</p> : null}
        </div>
      </section>
      ) : null}
      </div>
    </main>
  );
}
