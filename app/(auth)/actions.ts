"use server";

import { createClient } from "@/lib/supabase/server";

export interface RequestLinkState {
  error?: string;
  sent?: boolean;
  email?: string;
}

export async function requestSignInLink(
  _prevState: RequestLinkState | undefined,
  formData: FormData
): Promise<RequestLinkState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/set-pin` },
  });

  if (error) return { error: error.message };
  return { sent: true, email };
}

export interface SetPinState {
  error?: string;
  done?: boolean;
}

/** Sets (or replaces) the account password to the chosen PIN. Requires an active session. */
export async function setPin(_prevState: SetPinState | undefined, formData: FormData): Promise<SetPinState> {
  const pin = String(formData.get("pin") || "").trim();
  if (!/^\d{6}$/.test(pin)) return { error: "PIN must be 6 digits." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pin });
  if (error) return { error: error.message };
  return { done: true };
}

export interface PinSignInState {
  error?: string;
  done?: boolean;
}

export async function signInWithPin(
  _prevState: PinSignInState | undefined,
  formData: FormData
): Promise<PinSignInState> {
  const email = String(formData.get("email") || "").trim();
  const pin = String(formData.get("pin") || "").trim();
  if (!email) return { error: "Enter your email address." };
  if (!/^\d{6}$/.test(pin)) return { error: "Enter your 6-digit PIN." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
  if (error) return { error: "Incorrect email or PIN." };
  return { done: true };
}
