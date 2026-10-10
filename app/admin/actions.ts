"use server";

import { redirect } from "next/navigation";
import { checkPassword, clearAuthCookie, setAuthCookie } from "./lib/service";

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const base = String(formData.get("base") || "/admin");
  if (!checkPassword(password)) {
    redirect(`${base}?e=1`);
  }
  await setAuthCookie();
  redirect(base);
}

export async function logout(formData: FormData) {
  const base = String(formData.get("base") || "/admin");
  await clearAuthCookie();
  redirect(base);
}
