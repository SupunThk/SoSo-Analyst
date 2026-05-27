import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export interface ChartDataPoint {
  [key: string]: string | number;
}

export interface PriceChartProps {
  data: ChartDataPoint[];
  type?: 'line' | 'area';
  xAxisKey: string;
  series: {
    key: string;
    color: string;
    name?: string;
  }[];
  height?: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  type = 'line',
  xAxisKey,
  series,
  height = 300
}) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full w-full text-gray-500">No data available</div>;
  }

  const renderLineChart = () => (
    <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey={xAxisKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
      <Tooltip
        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
        itemStyle={{ color: '#e2e8f0' }}
      />
      <Legend />
      {series.map((s) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          stroke={s.color}
          name={s.name || s.key}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 6 }}
        />
      ))}
    </LineChart>
  );

  const renderAreaChart = () => (
    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
      <defs>
        {series.map((s) => (
          <linearGradient key={`color-${s.key}`} id={`color-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey={xAxisKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
      <Tooltip
        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
        itemStyle={{ color: '#e2e8f0' }}
      />
      <Legend />
      {series.map((s) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          stroke={s.color}
          fillOpacity={1}
          fill={`url(#color-${s.key})`}
          name={s.name || s.key}
        />
      ))}
    </AreaChart>
  );

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        {type === 'area' ? renderAreaChart() : renderLineChart()}
      </ResponsiveContainer>
    </div>
  );
};
