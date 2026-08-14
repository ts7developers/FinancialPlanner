import { LINE } from "@/lib/theme";

/** Placeholder matching a chart's footprint while its (lazy-loaded) recharts bundle downloads. */
export default function ChartSkeleton({ height }: { height: number }) {
  return <div style={{ height, borderRadius: 10, background: "#F4F1E6", border: `1px solid ${LINE}` }} />;
}
