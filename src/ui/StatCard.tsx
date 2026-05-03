import type { CSSProperties } from 'react';
import { RollingNumber } from './RollingNumber';

interface Props {
  label: string;
  value: number | string;
  accent: string;
  big?: boolean;
}

interface AccentStyle extends CSSProperties {
  '--accent': string;
}

export function StatCard({ label, value, accent, big }: Props) {
  const style: AccentStyle = { '--accent': accent };
  return (
    <div className="stat-card" style={style as CSSProperties}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${big ? 'big' : ''}`}>
        {label === 'MAX' ? value : <RollingNumber value={typeof value === 'number' ? value : 0} />}
      </div>
    </div>
  );
}
