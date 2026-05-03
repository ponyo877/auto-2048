import { useMemo, type CSSProperties } from 'react';

const MIN_MS = 50;
const MAX_MS = 2000;
const LOG_MIN = Math.log(MIN_MS);
const LOG_MAX = Math.log(MAX_MS);

interface Props { ms: number; onChange: (ms: number) => void; }

interface SliderStyle extends CSSProperties { '--pct': string; }

function msToSlider(ms: number): number {
  const t = (LOG_MAX - Math.log(ms)) / (LOG_MAX - LOG_MIN);
  return Math.round(t * 100);
}

function sliderToMs(sliderVal: number): number {
  const t = sliderVal / 100;
  return Math.round(Math.exp(LOG_MAX - t * (LOG_MAX - LOG_MIN)));
}

function formatMps(mps: number): string {
  return mps >= 10 ? mps.toFixed(0) : mps.toFixed(1);
}

export function SpeedSlider({ ms, onChange }: Props) {
  const sliderVal = useMemo(() => msToSlider(ms), [ms]);
  const movesPerSec = 1000 / ms;
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sliderToMs(Number(e.target.value)));
  };
  const sliderStyle: SliderStyle = { '--pct': `${sliderVal}%` };
  return (
    <div className="control-block">
      <div className="control-head">
        <span className="control-label">SPEED</span>
        <span className="control-value">
          {formatMps(movesPerSec)} <span className="unit">moves/s</span>
        </span>
      </div>
      <div className="slider-wrap">
        <span className="slider-icon" aria-hidden>🐢</span>
        <input
          type="range" min={0} max={100} step={1} value={sliderVal} onChange={handle}
          className="speed-slider"
          style={sliderStyle as CSSProperties}
        />
        <span className="slider-icon" aria-hidden>🚀</span>
      </div>
    </div>
  );
}
