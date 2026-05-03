import { useEffect, useState } from 'react';
import { createSolver, checkBrowserSupport, type Solver } from '@/solver';

export interface Progress { loaded: number; total: number }

interface NetConn { saveData?: boolean }
function isSaveDataOn(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: NetConn }).connection;
  return c?.saveData === true;
}

export interface SolverLoadState {
  solver: Solver | null;
  solverErr: string | null;
  progress: Progress | null;
  browserError: string | null;
  consented: boolean;
  consent: () => void;
}

interface RunArgs {
  weightsUrl: string;
  setSolver: (s: Solver) => void;
  setSolverErr: (e: string) => void;
  setProgress: (p: Progress) => void;
}

function startLoad(a: RunArgs): () => void {
  let disposed = false;
  const ctrl = new AbortController();
  const guarded = <T,>(fn: (v: T) => void) => (v: T) => { if (!disposed) fn(v); };
  createSolver(
    { network: '4x6patt', wasmUrl: '/solver.js', weightsUrl: a.weightsUrl },
    {
      signal: ctrl.signal,
      onProgress: (loaded, total) => guarded<Progress>(a.setProgress)({ loaded, total }),
    },
  )
    .then(guarded<Solver>(a.setSolver))
    .catch((e: unknown) => guarded<string>(a.setSolverErr)(String(e)));
  return () => { disposed = true; ctrl.abort(); };
}

export function useSolverLoader(weightsUrl: string): SolverLoadState {
  const [solver, setSolver] = useState<Solver | null>(null);
  const [solverErr, setSolverErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [browserError] = useState<string | null>(() => checkBrowserSupport());
  const [consented, setConsented] = useState<boolean>(() => !isSaveDataOn());

  useEffect(() => {
    if (browserError || !consented) return;
    return startLoad({ weightsUrl, setSolver, setSolverErr, setProgress });
  }, [browserError, consented, weightsUrl]);

  return {
    solver, solverErr, progress, browserError, consented,
    consent: () => setConsented(true),
  };
}
