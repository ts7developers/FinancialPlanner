"use client";

import { useActionState } from "react";
import { signInWithMagicLink, type MagicLinkState } from "../actions";
import { INK, NAVY, GOLD, CARD, LINE, MUTE, GOLD_SOFT } from "@/lib/theme";

const initialState: MagicLinkState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(signInWithMagicLink, initialState);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(120deg, ${INK}, ${NAVY} 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: GOLD,
              fontWeight: 600,
            }}
          >
            West Carr &amp; Harvey · Fortnightly
          </div>
          <h1
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 28,
              fontWeight: 700,
              margin: "4px 0 0",
              color: "#fff",
            }}
          >
            The Reconciliation
          </h1>
        </div>

        <div style={{ background: CARD, borderRadius: 14, padding: 24, border: `1px solid ${LINE}` }}>
          {state.sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>
                Check your email
              </div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
                We sent a sign-in link to <b style={{ color: NAVY }}>{state.email}</b>. Open it on this
                device to continue.
              </div>
            </div>
          ) : (
            <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label
                  htmlFor="email"
                  style={{
                    fontSize: 10.5,
                    color: MUTE,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: `1px solid ${LINE}`,
                    borderRadius: 8,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 15,
                    color: NAVY,
                    background: "#FCFBF7",
                  }}
                />
              </div>
              {state.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{state.error}</div>}
              <button
                type="submit"
                disabled={pending}
                style={{
                  background: GOLD,
                  color: INK,
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.7 : 1,
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                {pending ? "Sending…" : "Send me a sign-in link"}
              </button>
              <div style={{ fontSize: 11.5, color: MUTE, textAlign: "center", lineHeight: 1.5 }}>
                No password needed — we&apos;ll email you a link.
              </div>
            </form>
          )}
        </div>
        <div style={{ fontSize: 11, color: GOLD_SOFT, marginTop: 16, textAlign: "center", opacity: 0.8 }}>
          General information to help you track, not financial advice.
        </div>
      </div>
    </div>
  );
}
