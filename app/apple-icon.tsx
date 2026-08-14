import { ImageResponse } from "next/og";
import { appIconElement } from "@/lib/appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(appIconElement(180), { ...size });
}
