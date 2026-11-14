import { useId, type ReactNode } from 'react';

type TooltipProps = {
  title: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
  className?: string;
};

// CSS-only tooltip: shows on hover and on keyboard focus inside the trigger.
export function Tooltip({ title, children, placement = 'top', className = '' }: TooltipProps) {
  const id = useId();
  const position = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <span className={`group/tooltip relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[320px] -translate-x-1/2 ${position} rounded-md border border-accent-green/30 bg-[#081008] px-2 py-1 text-[10px] font-mono tracking-[0.04em] text-text-primary opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100`}
      >
        {title}
      </span>
    </span>
  );
}
