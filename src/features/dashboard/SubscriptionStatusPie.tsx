import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SubscriptionStatusPieProps {
  distribution: Record<string, number>;
}

export const SubscriptionStatusPie: React.FC<SubscriptionStatusPieProps> = ({
  distribution,
}) => {
  const colorMap: Record<string, string> = {
    active: '#10B981', // Emerald
    confirmed: '#3B82F6', // Blue
    paused: '#F59E0B', // Amber
    closed: '#64748B', // Slate
    draft: '#94A3B8', // Light Slate
    expired: '#EF4444', // Red
    quotation: '#8B5CF6', // Purple
  };

  const data = Object.entries(distribution).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: colorMap[status] || '#CBD5E1',
  }));

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-400">
        No subscription data available
      </div>
    );
  }

  return (
    <div className="h-72 w-full flex flex-col justify-between">
      <div className="h-52 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0];
                  return (
                    <div className="bg-navy-900 text-white px-3 py-1.5 rounded-lg shadow-lg text-xs">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-cyan-400 font-bold">{item.value} subscriptions</p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center Total Counter */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-slate-900">{total}</span>
          <span className="text-[11px] font-medium text-slate-400">Total Subs</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
        {data.map(item => (
          <div key={item.name} className="flex items-center justify-between text-slate-600">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.name}</span>
            </div>
            <span className="font-semibold text-slate-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
