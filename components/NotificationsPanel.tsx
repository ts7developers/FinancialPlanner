"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Panel } from "@/components/ui/atoms";
import { GOLD, INK, MUTE, LINE } from "@/lib/theme";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Real push notifications for payday/bill-due/unreconciled-fortnight reminders (sent by the daily
 * /api/cron/reminders job), rather than only the in-app banner on Overview — which only helps if
 * you happen to open the app that day. Requires the site to be installed/visited over HTTPS
 * (or localhost) and a browser that supports the Push API — Safari on iOS needs the app added to
 * the home screen first.
 */
function pushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

export default function NotificationsPanel() {
  const [supported] = useState(pushSupported);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("not configured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications were blocked — check your browser's site settings to allow them.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!res.ok) throw new Error("save failed");
      setSubscribed(true);
    } catch {
      setError("Could not turn on notifications — try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Could not turn that off — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Notifications" icon={Bell}>
      <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>
        Real push notifications for payday tomorrow, a bill due in 3 days, or a fortnight that&apos;s ended and still isn&apos;t reconciled
        — sent once a day, not repeated once you&apos;ve seen them. Different from the in-app banner on Overview, which only helps if
        you happen to open the app.
      </div>
      {!supported ? (
        <div style={{ fontSize: 12.5, color: MUTE }}>This browser doesn&apos;t support push notifications (on iOS, add this app to your home screen first).</div>
      ) : (
        <button
          onClick={subscribed ? disable : enable}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: subscribed ? "transparent" : GOLD,
            color: subscribed ? MUTE : INK,
            border: subscribed ? `1px solid ${LINE}` : "none",
            borderRadius: 8,
            padding: "9px 15px",
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}
        >
          {subscribed ? <BellOff size={14} /> : <Bell size={14} />} {busy ? "Working…" : subscribed ? "Turn off reminders" : "Enable reminders"}
        </button>
      )}
      {error && <div style={{ fontSize: 12, color: "#C0492F", marginTop: 8 }}>{error}</div>}
    </Panel>
  );
}
