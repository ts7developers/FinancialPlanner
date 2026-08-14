import { ImageResponse } from "next/og";
import { appIconElement } from "@/lib/appIcon";

const size = { width: 512, height: 512 };

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(appIconElement(512), { ...size });
}
