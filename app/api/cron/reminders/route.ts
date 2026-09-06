import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPeriods, isoFromDate } from "@/lib/period";
import { nextPaydayInfo, nextBillDue, mostRecentUnreconciledPeriod } from "@/lib/derive";
import type { Profile, RecurringExpense, Reconciliation } from "@/lib/types";

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Reminder {
  key: string;
  title: string;
  body: string;
  url: string;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Runs daily (see vercel.json) and pushes at most once per reminder per user, tracked in
 * `sent_reminders` so re-running the cron (or it firing more than once in a day) never double-sends —
 * each reminder fires on the one day its condition is exactly true (e.g. "payday is tomorrow"),
 * not on every day leading up to it.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createServiceClient();
  const today = isoFromDate(new Date());

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*");
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const summary: { userId: string; sent: string[] }[] = [];

  for (const profile of (profiles ?? []) as Profile[]) {
    const [subsRes, recurringRes, reconciliationsRes, sentRes] = await Promise.all([
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", profile.user_id),
      supabase.from("recurring_expenses").select("*").eq("user_id", profile.user_id).eq("active", true),
      supabase.from("reconciliations").select("*").eq("user_id", profile.user_id),
      supabase.from("sent_reminders").select("reminder_key").eq("user_id", profile.user_id),
    ]);
    const subs = (subsRes.data ?? []) as PushSubscriptionRow[];
    if (subs.length === 0) continue;

    const alreadySent = new Set((sentRes.data ?? []).map((r) => r.reminder_key as string));
    const periods = buildPeriods(profile.pay_anchor);
    const paydayOffsetDays = profile.payday_offset_days ?? 2;
    const reconciliationsByKey = Object.fromEntries(((reconciliationsRes.data ?? []) as Reconciliation[]).map((r) => [r.period_key, r]));

    const toSend: Reminder[] = [];

    const payday = nextPaydayInfo(periods, today, paydayOffsetDays);
    if (payday && payday.days === 1) {
      const key = `payday:${payday.dateISO}`;
      if (!alreadySent.has(key)) toSend.push({ key, title: "Payday tomorrow", body: `Pay lands ${payday.dateISO}.`, url: "/reconcile" });
    }

    const bill = nextBillDue((recurringRes.data ?? []) as RecurringExpense[], today);
    if (bill && bill.days === 3) {
      const key = `bill:${bill.description}:${bill.dateISO}`;
      if (!alreadySent.has(key)) toSend.push({ key, title: `${bill.description} due in 3 days`, body: `Due ${bill.dateISO}.`, url: "/expenses" });
    }

    const unreconciled = mostRecentUnreconciledPeriod(periods, reconciliationsByKey, today, paydayOffsetDays);
    if (unreconciled) {
      const key = `reconcile:${unreconciled.key}`;
      if (!alreadySent.has(key)) toSend.push({ key, title: "Fortnight not reconciled", body: `The ${unreconciled.key} fortnight is still open.`, url: `/reconcile?period=${unreconciled.key}` });
    }

    const sentKeys: string[] = [];
    for (const reminder of toSend) {
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: reminder.title, body: reminder.body, url: reminder.url })
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 404/410 means the browser unsubscribed (uninstalled, cleared data, etc) — clean it up.
          if (statusCode === 404 || statusCode === 410) await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
      await supabase.from("sent_reminders").insert({ user_id: profile.user_id, reminder_key: reminder.key });
      sentKeys.push(reminder.key);
    }
    if (sentKeys.length > 0) summary.push({ userId: profile.user_id, sent: sentKeys });
  }

  return NextResponse.json({ ok: true, sent: summary });
}
