import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAppData } from "@/lib/data/fetchAppData";
import { AppDataProvider } from "@/components/AppDataProvider";
import AppHeader from "@/components/AppHeader";
import QuickAddFab from "@/components/QuickAddFab";
import PageContent from "@/components/PageContent";
import { PAPER } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-braces alongside proxy.ts, which already redirects unauthenticated requests.
  if (!user) redirect("/login");

  const {
    profile,
    categories,
    transactions,
    reconciliations,
    snapshots,
    balances,
    payslips,
    transfers,
    holdings,
    holdingLots,
    superContributions,
  } = await fetchAppData(user.id);

  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: "#1F2A44" }}>
      <AppHeader />
      <AppDataProvider
        initialProfile={profile}
        initialCategories={categories}
        initialTransactions={transactions}
        initialReconciliations={reconciliations}
        initialSnapshots={snapshots}
        initialBalances={balances}
        initialPayslips={payslips}
        initialTransfers={transfers}
        initialHoldings={holdings}
        initialHoldingLots={holdingLots}
        initialSuperContributions={superContributions}
      >
        <PageContent>{children}</PageContent>
      </AppDataProvider>
      <QuickAddFab />
    </div>
  );
}
