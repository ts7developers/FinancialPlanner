import { ImageResponse } from "next/og";
import { appIconElement } from "@/lib/appIcon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(appIconElement(32), { ...size });
}
