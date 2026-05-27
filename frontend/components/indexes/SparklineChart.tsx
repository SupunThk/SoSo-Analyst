'use client';

import React, { useId, useMemo } from 'react';

interface SparklineChartProps {
  /** Array of numeric price values (oldest → newest). */
  data: number[];
  /** SVG width in px. */
  width?: number;
  /** SVG height in px. */
  height?: number;
  /** Override colour (otherwise auto green/red). */
  color?: string;
  className?: string;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  width = 200,
  height = 48,
  color,
  className,
}) => {
  const gradientId = `spark-${useId().replace(/:/g, '')}`;
  const { path, areaPath, stroke } = useMemo(() => {
    if (!data || data.length < 2) return { path: '', areaPath: '', stroke: '#555' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padY = height * 0.1; // 10 % padding top/bottom
    const effectiveH = height - padY * 2;

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: padY + effectiveH - ((v - min) / range) * effectiveH,
    }));

    // Build smooth cubic bézier path
    const lineSegments = points.map((p, i) => {
      if (i === 0) return `M ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      const prev = points[i - 1];
      const cpx = (prev.x + p.x) / 2;
      return `C ${cpx.toFixed(2)},${prev.y.toFixed(2)} ${cpx.toFixed(2)},${p.y.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    });

    const linePath = lineSegments.join(' ');
    const last = points[points.length - 1];
    const first = points[0];
    const area = `${linePath} L ${last.x.toFixed(2)},${height} L ${first.x.toFixed(2)},${height} Z`;

    const trending = data[data.length - 1] >= data[0];
    const strokeColor = color || (trending ? '#00ff9d' : '#ff4d4d');

    return { path: linePath, areaPath: area, stroke: strokeColor };
  }, [data, width, height, color]);

  if (!data || data.length < 2) {
    return (
      <div
        className={className}
        style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span className="text-[9px] font-mono text-text-secondary">No chart data</span>
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
};

export default SparklineChart;
