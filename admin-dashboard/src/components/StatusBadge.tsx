'use client';

import clsx from 'clsx';
import type { SubmissionStatus } from '@/types';

interface StatusBadgeProps {
  status: SubmissionStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  APPROVED: {
    label: 'Approved',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  REWARD_PENDING: {
    label: 'Reward Pending',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  REWARD_PAID: {
    label: 'Reward Paid',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  FLAGGED: {
    label: 'Flagged',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full border',
        config.className,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {config.label}
    </span>
  );
}
