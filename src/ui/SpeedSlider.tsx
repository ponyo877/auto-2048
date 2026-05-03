import { useMemo, type CSSProperties } from 'react';

/**
 * Speed slider: controls the inter-move delay only.
 *   slider 0   -> 2000 ms delay (slowest)
 *   slider 100 -> 0 ms delay (no throttle; AI computes back-to-back at
 *                              the depth's natural rate)
 *
 * The numeric delay is intentionally not shown — at high depths the AI's
 * own compute time dominates, so the slider's configured throttle has
 * little correspondence to the user-visible cadence. The 🐢↔🚀 endpoints
 * communicate the relative meaning without making a misleading promise.
 */

const MIN_MS = 1;          /* lowest non-zero step */
const MAX_MS = 2000;
const LOG_MIN = Math.log(MIN_MS);
const LOG_MAX = Math.log(MAX_MS);

interface Props { ms: number; onChange: (ms: number) => void; }
interface SliderStyle extends CSSProperties { '--pct': string; }

function msToSlider(ms: number): number {
  if (ms <= 0) return 100;
  const t = (LOG_MAX - Math.log(Math.max(MIN_MS, ms))) / (LOG_MAX - LOG_MIN);
  return Math.round(t * 100);
}

function sliderToMs(sliderVal: number): number {
  if (sliderVal >= 100) return 0;
  const t = sliderVal / 100;
  return Math.round(Math.exp(LOG_MAX - t * (LOG_MAX - LOG_MIN)));
}

export function SpeedSlider({ ms, onChange }: Props) {
  const sliderVal = useMemo(() => msToSlider(ms), [ms]);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sliderToMs(Number(e.target.value)));
  };
  const sliderStyle: SliderStyle = { '--pct': `${sliderVal}%` };
  return (
    <div className="control-block">
      <div className="control-head">
        <span className="control-label">SPEED</span>
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
