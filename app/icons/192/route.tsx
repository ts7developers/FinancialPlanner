import { ImageResponse } from "next/og";
import { appIconElement } from "@/lib/appIcon";

const size = { width: 192, height: 192 };

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(appIconElement(192), { ...size });
}
