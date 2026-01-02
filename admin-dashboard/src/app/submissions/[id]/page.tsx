'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { Sidebar } from '@/components/Sidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { useRequireAuth } from '@/hooks/useAuth';
import * as api from '@/lib/api';
import type { SubmissionDetail } from '@/types';

export default function SubmissionDetailPage() {
  const { admin, logout, ready } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);

  // Action state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [moderatorNote, setModeratorNote] = useState('');
  const [txHash, setTxHash] = useState(''); // Solscan transaction link

  useEffect(() => {
    if (!ready) return;

    const fetchSubmission = async () => {
      try {
        const data = await api.getSubmission(submissionId);
        setSubmission(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submission');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubmission();
  }, [ready, submissionId]);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await api.approveSubmission(submissionId, moderatorNote || undefined, txHash || undefined);
      router.push('/submissions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setIsSubmitting(false);
      setShowApproveModal(false);
    }
  };

  const handleReject = async () => {
    if (rejectReason.length < 10) {
      setError('Rejection reason must be at least 10 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.rejectSubmission(submissionId, rejectReason, moderatorNote || undefined);
      router.push('/submissions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setIsSubmitting(false);
      setShowRejectModal(false);
    }
  };

  const handleFlag = async () => {
    if (flagReason.length < 5) {
      setError('Flag reason is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.flagSubmission(submissionId, flagReason);
      router.push('/submissions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to flag');
    } finally {
      setIsSubmitting(false);
      setShowFlagModal(false);
    }
  };

  const canModerate = admin?.role !== 'READ_ONLY';
  const canAct =
    submission &&
    ['PENDING', 'UNDER_REVIEW', 'FLAGGED'].includes(submission.status);

  if (!ready || !admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full spinner" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar admin={admin} onLogout={logout} />

      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="mb-6 text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg
              className="w-5 h-5 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Queue
          </button>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full spinner mx-auto" />
              <p className="mt-2 text-gray-500">Loading submission...</p>
            </div>
          )}

          {/* Content */}
          {submission && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Proof Image */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">Proof</h2>
                </div>
                <div className="p-4">
                  {submission.proofUrl ? (
                    submission.proofFileType?.startsWith('video/') ? (
                      <video
                        src={submission.proofUrl}
                        controls
                        className="w-full rounded-lg"
                      />
                    ) : (
                      <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                        <Image
                          src={submission.proofUrl}
                          alt="Proof"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    )
                  ) : (
                    <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                      <p className="text-gray-500">No proof uploaded</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-6">
                {/* Task Info */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold">Task Details</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-sm text-gray-500">Task Name</label>
                      <p className="font-medium">{submission.taskName}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Category</label>
                      <p>{submission.taskCategory}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Description</label>
                      <p className="text-sm text-gray-700">
                        {submission.taskDescription}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Reward</label>
                      <p className="font-medium text-green-600">
                        {submission.rewardAmount} {submission.rewardToken}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submission Info */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold">Submission Info</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-sm text-gray-500">Status</label>
                      <div className="mt-1">
                        <StatusBadge status={submission.status} size="md" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Wallet</label>
                      <code className="block mt-1 text-sm bg-gray-100 px-2 py-1 rounded break-all">
                        {submission.walletAddress}
                      </code>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">Submitted</label>
                      <p>
                        {format(
                          new Date(submission.submittedAt),
                          'MMM d, yyyy HH:mm:ss'
                        )}
                      </p>
                    </div>
                    {submission.userNote && (
                      <div>
                        <label className="text-sm text-gray-500">User Note</label>
                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded mt-1">
                          {submission.userNote}
                        </p>
                      </div>
                    )}
                    {submission.rejectionReason && (
                      <div>
                        <label className="text-sm text-gray-500">
                          Rejection Reason
                        </label>
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-1">
                          {submission.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canModerate && canAct && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold mb-4">Actions</h2>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowApproveModal(true)}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setShowRejectModal(true)}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                      >
                        Reject
                      </button>
                      {submission.status !== 'FLAGGED' && (
                        <button
                          onClick={() => setShowFlagModal(true)}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
                        >
                          Flag
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* History */}
                {submission.moderationHistory.length > 0 && (
                  <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b">
                      <h2 className="text-lg font-semibold">Moderation History</h2>
                    </div>
                    <div className="divide-y">
                      {submission.moderationHistory.map((action) => (
                        <div key={action.id} className="px-6 py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {action.action}
                            </span>
                            <span className="text-xs text-gray-500">
                              {format(new Date(action.createdAt), 'MMM d, HH:mm')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            by {action.adminEmail}
                          </p>
                          {action.reason && (
                            <p className="text-sm text-gray-600 mt-1">
                              {action.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title="Confirm Approval"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to approve this submission? This will unlock the
          reward for the user.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Solscan Transaction Link (optional)
          </label>
          <input
            type="url"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="https://solscan.io/tx/..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Paste the Solscan link after sending the reward. This will be shown publicly.
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Internal Note (optional)
          </label>
          <textarea
            value={moderatorNote}
            onChange={(e) => setModeratorNote(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={2}
            placeholder="Add a note for the audit log..."
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Approving...' : 'Confirm Approval'}
          </button>
          <button
            onClick={() => setShowApproveModal(false)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Submission"
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rejection Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={3}
            placeholder="Explain why this submission is being rejected..."
          />
          <p className="text-xs text-gray-500 mt-1">
            This will be visible to the user
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Internal Note (optional)
          </label>
          <textarea
            value={moderatorNote}
            onChange={(e) => setModeratorNote(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={2}
            placeholder="Add a private note..."
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReject}
            disabled={isSubmitting || rejectReason.length < 10}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
          <button
            onClick={() => setShowRejectModal(false)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Flag Modal */}
      <Modal
        isOpen={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        title="Flag for Review"
      >
        <p className="text-gray-600 mb-4">
          Flag this submission for senior review. Provide a reason for flagging.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Flag Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={3}
            placeholder="Why should this be reviewed by a senior moderator?"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleFlag}
            disabled={isSubmitting || flagReason.length < 5}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Flagging...' : 'Flag Submission'}
          </button>
          <button
            onClick={() => setShowFlagModal(false)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
