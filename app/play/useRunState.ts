"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadRun, saveRun } from "./storage";

/** State that survives a refresh. `finished` runs are no longer offered for resume. */
export function useRunState<T>(id: string, init: () => T) {
  const [state, setState] = useState<T>(() => {
    const saved = loadRun<{ state: T }>(id);
    return saved?.state ?? init();
  });
  const finished = useRef(false);

  useEffect(() => {
    saveRun(id, { state, finished: finished.current });
  }, [id, state]);

  const markFinished = useCallback(() => {
    finished.current = true;
    saveRun(id, { state, finished: true });
  }, [id, state]);

  return [state, setState, markFinished] as const;
}
