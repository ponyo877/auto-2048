import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export function IconButton({ children, onClick, label, disabled }: Props) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={label} disabled={disabled}>
      {children}
    </button>
  );
}
