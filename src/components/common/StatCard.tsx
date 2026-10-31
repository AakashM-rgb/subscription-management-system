import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  isPositive?: boolean;
  description?: string;
  trendText?: string;
  iconColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  change,
  isPositive,
  description,
  trendText,
  iconColor = 'blue',
}) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <Card className="p-6 relative overflow-hidden" hover>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center border',
            colorMap[iconColor]
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </h2>
      </div>

      {(change || description || trendText) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {change && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded',
                isPositive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              )}
            >
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {change}
            </span>
          )}
          <span className="text-slate-500 truncate">
            {trendText || description}
          </span>
        </div>
      )}
    </Card>
  );
};
