"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeriveInput } from "@/lib/derive";
import type { ScanSnapshot } from "@/lib/types";

/** Runs balance scans; the crypto + network code is loaded on first use. */
export function useScanner() {
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(async (params: DeriveInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSnapshot({
      status: "running",
      groups: [],
      chains: {},
      prices: null,
      checked: 0,
      startedAt: Date.now(),
    });

    try {
      const { runScan } = await import("@/lib/scanner");
      if (controller.signal.aborted) return;
      await runScan(params, {
        signal: controller.signal,
        onUpdate: (next) => {
          if (controllerRef.current === controller) setSnapshot(next);
        },
      });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      setSnapshot((prev) => ({
        ...(prev as ScanSnapshot),
        status: "error",
        error: error instanceof Error ? error.message : "Failed to load the scanner",
      }));
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSnapshot(null);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { snapshot, start, stop, reset };
}
