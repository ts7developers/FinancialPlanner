"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestSignInLink, signInWithPin, type RequestLinkState, type PinSignInState } from "../actions";
import { getRememberedEmail, setRememberedEmail, clearRememberedEmail } from "@/lib/pinAuth";
import { NAVY, MUTE } from "@/lib/theme";
import AuthShell, { fieldLabelStyle, fieldStyle, pinFieldStyle, authButtonStyle } from "@/components/AuthShell";

const initialRequestState: RequestLinkState = {};
const initialPinSignInState: PinSignInState = {};

type Step = "loading" | "pin" | "entry" | "recover";

export default function LoginPage() {
  const router = useRouter();
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
      setStep("entry");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (pinSignInState.done) {
      setRememberedEmail(email);
      router.push("/overview");
    }
  }, [pinSignInState, email, router]);

  if (step === "loading") return <AuthShell> </AuthShell>;

  if (step === "recover") {
    if (requestState.sent) {
      return (
        <AuthShell>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>
              Check your email
            </div>
            <div style={{ fontSize: 13, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
              We sent a sign-in link to <b style={{ color: NAVY }}>{requestState.email}</b>. Open it to
              set a new PIN.
            </div>
          </div>
        </AuthShell>
      );
    }
    return (
      <AuthShell>
        <form action={requestAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>Reset your PIN</div>
            <div style={{ fontSize: 13, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>
              We&apos;ll email you a sign-in link — open it to set a new PIN.
            </div>
          </div>
          <div>
            <label htmlFor="email" style={fieldLabelStyle}>
              Email
            </label>
            <input id="email" name="email" type="email" required defaultValue={email} placeholder="you@example.com" style={fieldStyle} />
          </div>
          {requestState.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{requestState.error}</div>}
          <button type="submit" disabled={requestPending} style={authButtonStyle(requestPending)}>
            {requestPending ? "Sending…" : "Send me a link"}
          </button>
          <button
            type="button"
            onClick={() => setStep(getRememberedEmail() ? "pin" : "entry")}
            style={{ background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer", textAlign: "center" }}
          >
            Back
          </button>
        </form>
      </AuthShell>
    );
  }

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
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              type="button"
              onClick={() => {
                clearRememberedEmail();
                setEmail("");
                setStep("entry");
              }}
              style={{ background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer" }}
            >
              Not you?
            </button>
            <button type="button" onClick={() => setStep("recover")} style={{ background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer" }}>
              Forgot PIN?
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form action={pinSignInAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label htmlFor="email" style={fieldLabelStyle}>
            Email
          </label>
          <input id="email" name="email" type="email" required placeholder="you@example.com" style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="pin" style={fieldLabelStyle}>
            PIN
          </label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} required placeholder="••••••" style={pinFieldStyle} />
        </div>
        {pinSignInState.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{pinSignInState.error}</div>}
        <button type="submit" disabled={pinSignInPending} style={authButtonStyle(pinSignInPending)}>
          {pinSignInPending ? "Signing in…" : "Unlock"}
        </button>
        <button type="button" onClick={() => setStep("recover")} style={{ background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer", textAlign: "center" }}>
          Forgot PIN? Get a reset link by email
        </button>
      </form>
    </AuthShell>
  );
}
