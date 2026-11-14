type SpinnerProps = { size?: number; className?: string; label?: string };

export function Spinner({ size = 30, className = '', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-2 border-accent-green/25 border-t-accent-green ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
