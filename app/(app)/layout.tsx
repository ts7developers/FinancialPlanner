import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import { PAPER } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-braces alongside proxy.ts, which already redirects unauthenticated requests.
  if (!user) redirect("/login");

  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: "#1F2A44" }}>
      <AppHeader />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 14px 60px" }}>{children}</div>
    </div>
  );
}
