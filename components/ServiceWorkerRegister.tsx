"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Dev-only guard: Next.js dev-mode chunk URLs aren't content-hashed the way
    // production build output is, so a cache-first service worker in dev serves
    // stale JS forever after any edit — register production builds only.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
