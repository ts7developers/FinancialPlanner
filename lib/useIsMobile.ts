"use client";

import { useEffect, useState } from "react";

export function useIsMobile(bp = 680) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}
