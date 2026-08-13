"use server";

import { createClient } from "@/lib/supabase/server";

export interface MagicLinkState {
  error?: string;
  sent?: boolean;
  email?: string;
}

export async function signInWithMagicLink(
  _prevState: MagicLinkState | undefined,
  formData: FormData
): Promise<MagicLinkState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) return { error: error.message };
  return { sent: true, email };
}
