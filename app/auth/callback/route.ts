import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the magic-link email's confirmation URL redirects after Supabase verifies it
// (PKCE flow — @supabase/ssr's default). No email-template customization needed.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/overview";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
