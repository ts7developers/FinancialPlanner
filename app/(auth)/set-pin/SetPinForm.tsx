"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setPin, type SetPinState } from "../actions";
import { setRememberedEmail } from "@/lib/pinAuth";
import { NAVY, MUTE } from "@/lib/theme";
import AuthShell, { fieldLabelStyle, pinFieldStyle, authButtonStyle } from "@/components/AuthShell";

const initialState: SetPinState = {};

export default function SetPinForm({ email }: { email: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setPin, initialState);

  useEffect(() => {
    if (state.done) {
      setRememberedEmail(email);
      router.push("/overview");
    }
  }, [state, email, router]);

  return (
    <AuthShell>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>Set a PIN</div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>
            You&apos;re verified as <b style={{ color: NAVY }}>{email}</b>. Set a 6-digit PIN so you can
            unlock this app on this device next time without checking email.
          </div>
        </div>
        <div>
          <label htmlFor="pin" style={fieldLabelStyle}>
            New PIN
          </label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} required placeholder="••••••" autoFocus style={pinFieldStyle} />
        </div>
        {state.error && <div style={{ fontSize: 12.5, color: "#C0492F" }}>{state.error}</div>}
        <button type="submit" disabled={pending} style={authButtonStyle(pending)}>
          {pending ? "Saving…" : "Save PIN & continue"}
        </button>
      </form>
    </AuthShell>
  );
}
