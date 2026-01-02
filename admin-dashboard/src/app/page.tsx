'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { StatsCard } from '@/components/StatsCard';
import { SubmissionTable } from '@/components/SubmissionTable';
import { useRequireAuth } from '@/hooks/useAuth';
import * as api from '@/lib/api';
import type { DashboardStats, SubmissionListItem } from '@/types';

export default function DashboardPage() {
  const { admin, logout, ready } = useRequireAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSubmissions, setRecentSubmissions] = useState<SubmissionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const fetchData = async () => {
      try {
        const [statsData, submissionsData] = await Promise.all([
          api.getStats(),
          api.getSubmissions({ limit: 10, status: 'PENDING', sortOrder: 'desc' }),
        ]);
        setStats(statsData);
        setRecentSubmissions(submissionsData.items);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [ready]);

  if (!ready || !admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full spinner" />
      </div>
    );
  }

  const formatAvgTime = (ms: number | null): string => {
    if (!ms) return 'N/A';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar admin={admin} onLogout={logout} />

      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500">Overview of moderation activity</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Pending Review"
              value={stats?.pendingCount ?? '-'}
              color={stats && stats.pendingCount > 0 ? 'warning' : 'default'}
            />
            <StatsCard
              title="Approved Today"
              value={stats?.todayApproved ?? '-'}
              color="success"
            />
            <StatsCard
              title="Rejected Today"
              value={stats?.todayRejected ?? '-'}
              color="danger"
            />
            <StatsCard
              title="Avg Review Time"
              value={formatAvgTime(stats?.avgReviewTimeMs ?? null)}
              subtitle="Based on today's reviews"
            />
          </div>

          {/* Flagged Alert */}
          {stats && stats.flaggedCount > 0 && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-orange-500 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-orange-800 font-medium">
                  {stats.flaggedCount} submission{stats.flaggedCount !== 1 ? 's' : ''} flagged
                  for review
                </span>
              </div>
              <button
                onClick={() => router.push('/submissions?status=FLAGGED')}
                className="text-orange-600 hover:text-orange-700 font-medium text-sm"
              >
                View All
              </button>
            </div>
          )}

          {/* Recent Submissions */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Submissions
              </h2>
              <button
                onClick={() => router.push('/submissions')}
                className="text-brand-600 hover:text-brand-700 text-sm font-medium"
              >
                View All
              </button>
            </div>
            <SubmissionTable
              submissions={recentSubmissions}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
