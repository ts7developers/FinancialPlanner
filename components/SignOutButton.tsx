import { RotateCcw } from "lucide-react";
import { signOut } from "@/app/(app)/actions";

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="tabbtn"
        style={{
          background: "transparent",
          border: "1px solid #2C3A5C",
          color: "#9FB0CE",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <RotateCcw size={13} /> Sign out
      </button>
    </form>
  );
}
