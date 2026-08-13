"use client";

// Remembers the signed-up email on this device so returning visits only ask for
// the PIN, not the email + OTP round trip again. Email isn't sensitive, so
// localStorage is fine — this is a convenience, not a security boundary.
const REMEMBERED_EMAIL_KEY = "reconciliation:rememberedEmail";

export function getRememberedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
}

export function setRememberedEmail(email: string) {
  window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
}

export function clearRememberedEmail() {
  window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}
