'use client';

import clsx from 'clsx';

interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatsCard({
  title,
  value,
  subtitle,
  trend,
  color = 'default',
}: StatsCardProps) {
  const colorClasses = {
    default: 'bg-white',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
  };

  const valueColorClasses = {
    default: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-yellow-700',
    danger: 'text-red-700',
  };

  return (
    <div
      className={clsx(
        'p-6 rounded-lg border shadow-sm',
        colorClasses[color]
      )}
    >
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <div className="flex items-baseline">
        <p className={clsx('text-3xl font-bold', valueColorClasses[color])}>
          {value}
        </p>
        {trend && (
          <span
            className={clsx('ml-2 text-sm', {
              'text-green-600': trend === 'up',
              'text-red-600': trend === 'down',
              'text-gray-500': trend === 'neutral',
            })}
          >
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trend === 'neutral' && '→'}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
