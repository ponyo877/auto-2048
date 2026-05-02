interface Props {
  isPlaying: boolean;
  speed: number;
  depth: number;
  busy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (v: number) => void;
  onDepthChange: (v: number) => void;
}

export function Controls(p: Props) {
  return (
    <div className="controls">
      {p.isPlaying
        ? <button onClick={p.onPause}>Pause</button>
        : <button onClick={p.onPlay} disabled={p.busy}>Play</button>}
      <button onClick={p.onStep} disabled={p.isPlaying || p.busy}>Step</button>
      <button onClick={p.onReset}>Reset</button>
      <label>
        speed
        <input
          type="range" min={0} max={1000} step={10}
          value={p.speed}
          onChange={(e) => p.onSpeedChange(Number(e.target.value))}
        />
        <span>{p.speed === 0 ? 'max' : `${p.speed}ms`}</span>
      </label>
      <label>
        depth
        <select value={p.depth} onChange={(e) => p.onDepthChange(Number(e.target.value))}>
          <option value={1}>1 (greedy)</option>
          <option value={2}>2 ply</option>
          <option value={3}>3 ply</option>
          <option value={4}>4 ply (≈100% 2048)</option>
          <option value={5}>5 ply (slow)</option>
        </select>
      </label>
    </div>
  );
}
