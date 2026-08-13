"use client";

import { useActionState, useEffect, useState } from "react";
import { requestSignInLink, signInWithPin, type RequestLinkState, type PinSignInState } from "../actions";
import { getRememberedEmail, clearRememberedEmail } from "@/lib/pinAuth";
import { NAVY, MUTE } from "@/lib/theme";
import AuthShell, { fieldLabelStyle, fieldStyle, pinFieldStyle, authButtonStyle } from "@/components/AuthShell";

const initialRequestState: RequestLinkState = {};
const initialPinSignInState: PinSignInState = {};

type Step = "loading" | "pin" | "email";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");

  const [requestState, requestAction, requestPending] = useActionState(requestSignInLink, initialRequestState);
  const [pinSignInState, pinSignInAction, pinSignInPending] = useActionState(signInWithPin, initialPinSignInState);

  useEffect(() => {
    // Must run client-only: the server has no access to localStorage, so checking it
    // during render would mismatch between SSR and hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    const remembered = getRememberedEmail();
    if (remembered) {
      setEmail(remembered);
      setStep("pin");
    } else {
      setStep("email");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (step === "loading") return <AuthShell> </AuthShell>;

  if (step === "pin") {
    return (
      <AuthShell>
        <form action={pinSignInAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="hidden" name="email" value={email} />
          <div>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>Welcome back</div>
            <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>{email}</div>
          </div>
          <div>
            <label htmlFor="pin" style={fieldLabelStyle}>
              PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              required
              placeholder="••••••"
              autoFocus
              style={pinFieldStyle}
            />
          </div>
          {pinSignInState.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{pinSignInState.error}</div>}
          <button type="submit" disabled={pinSignInPending} style={authButtonStyle(pinSignInPending)}>
            {pinSignInPending ? "Signing in…" : "Unlock"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearRememberedEmail();
              setEmail("");
              setStep("email");
            }}
            style={{ background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer", textAlign: "center" }}
          >
            Not you? Use email instead
          </button>
        </form>
      </AuthShell>
    );
  }

  if (requestState.sent) {
    return (
      <AuthShell>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>
            Check your email
          </div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
            We sent a sign-in link to <b style={{ color: NAVY }}>{requestState.email}</b>. Open it to
            continue — you&apos;ll set a PIN right after, so you won&apos;t need email again on this
            device.
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form action={requestAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label htmlFor="email" style={fieldLabelStyle}>
            Email
          </label>
          <input id="email" name="email" type="email" required placeholder="you@example.com" style={fieldStyle} />
        </div>
        {requestState.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{requestState.error}</div>}
        <button type="submit" disabled={requestPending} style={authButtonStyle(requestPending)}>
          {requestPending ? "Sending…" : "Send me a sign-in link"}
        </button>
        <div style={{ fontSize: 11.5, color: MUTE, textAlign: "center", lineHeight: 1.5 }}>
          First time here — we&apos;ll email you a link once, then you&apos;ll set a PIN for next time.
        </div>
      </form>
    </AuthShell>
  );
}
