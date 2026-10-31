import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'purple'
    | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  const dotColors = {
    default: 'bg-slate-400',
    primary: 'bg-blue-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-cyan-500',
    purple: 'bg-purple-500',
    neutral: 'bg-slate-400',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])}
        />
      )}
      <span>{children}</span>
    </span>
  );
};

// Helper for status badge rendering
export const StatusBadge: React.FC<{ status: string; label?: string }> = ({
  status,
  label,
}) => {
  const norm = status.toLowerCase();
  let variant: BadgeProps['variant'] = 'default';

  switch (norm) {
    case 'active':
    case 'paid':
    case 'accepted':
    case 'converted':
      variant = 'success';
      break;
    case 'confirmed':
    case 'sent':
      variant = 'info';
      break;
    case 'paused':
    case 'warning':
      variant = 'warning';
      break;
    case 'closed':
    case 'expired':
    case 'cancelled':
    case 'rejected':
    case 'overdue':
      variant = 'danger';
      break;
    case 'draft':
    case 'quotation':
      variant = 'neutral';
      break;
    case 'admin':
      variant = 'purple';
      break;
    case 'staff':
      variant = 'primary';
      break;
    case 'customer':
      variant = 'default';
      break;
    default:
      variant = 'default';
  }

  const displayText = label || norm.charAt(0).toUpperCase() + norm.slice(1);

  return (
    <Badge variant={variant} dot>
      {displayText}
    </Badge>
  );
};
