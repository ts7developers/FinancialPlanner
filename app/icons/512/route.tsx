import { ImageResponse } from "next/og";
import { INK, GOLD } from "@/lib/theme";

const size = { width: 512, height: 512 };

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: INK,
          color: GOLD,
          fontSize: 288,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    { ...size }
  );
}
