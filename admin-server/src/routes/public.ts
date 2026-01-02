// =============================================================================
// PUBLIC ROUTES - No authentication required
// =============================================================================
// These endpoints are publicly accessible for the user app to fetch
// global statistics without authentication.
// =============================================================================
import { Router } from 'express';
import { prisma } from '../services/database.js';
import { successResponse } from '../utils/index.js';

const router = Router();

/**
 * GET /public/stats
 * Returns global platform statistics
 * No authentication required
 */
router.get('/stats', async (_req, res, next) => {
  try {
    // Get aggregated stats
    const [
      totalApproved,
      totalPending,
      activeUsersCount,
      totalRewardsResult,
      recentActivity,
      taskCount,
    ] = await Promise.all([
      // Total approved submissions
      prisma.taskSubmission.count({
        where: { status: { in: ['APPROVED', 'REWARD_PENDING', 'REWARD_PAID'] } },
      }),
      // Total pending submissions
      prisma.taskSubmission.count({
        where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      }),
      // Active users (users with at least one submission)
      prisma.platformUser.count(),
      // Total rewards distributed (sum of approved task rewards)
      prisma.$queryRaw<[{ total: number }]>`
        SELECT COALESCE(SUM(t.reward_amount), 0) as total
        FROM task_submissions ts
        JOIN tasks t ON ts.task_id = t.id
        WHERE ts.status IN ('APPROVED', 'REWARD_PENDING', 'REWARD_PAID')
      `,
      // Recent activity (last 20 approved/completed)
      prisma.taskSubmission.findMany({
        where: {
          status: { in: ['APPROVED', 'REWARD_PAID'] },
        },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          submittedAt: true,
          rewardTxHash: true, // Include Solscan transaction link
          task: { select: { name: true, rewardAmount: true } },
          user: { select: { walletAddress: true } },
        },
      }),
      // Total active tasks
      prisma.task.count({ where: { isActive: true } }),
    ]);

    // Format recent activity
    const formattedActivity = recentActivity.map((sub) => ({
      id: sub.id,
      type: sub.status === 'REWARD_PAID' ? 'reward_claimed' : 'task_completed',
      walletAddress: sub.user.walletAddress.slice(0, 4) + '...' + sub.user.walletAddress.slice(-4),
      taskName: sub.task.name,
      rewardAmount: sub.task.rewardAmount,
      timestamp: sub.reviewedAt || sub.submittedAt,
      txHash: sub.rewardTxHash, // Solscan link for verification
    }));

    res.json(successResponse({
      totalTasksCompleted: totalApproved,
      totalPending,
      activeUsers: activeUsersCount,
      totalRewardsDistributed: totalRewardsResult[0]?.total || 0,
      totalTasks: taskCount,
      recentActivity: formattedActivity,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /public/tasks
 * Returns list of available tasks
 * No authentication required
 */
router.get('/tasks', async (_req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        rewardAmount: true,
        rewardToken: true,
        maxSubmissions: true,
        cooldownHours: true,
      },
    });

    res.json(successResponse({ tasks }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /public/leaderboard
 * Returns top users by completed tasks
 * No authentication required
 */
router.get('/leaderboard', async (_req, res, next) => {
  try {
    const topUsers = await prisma.platformUser.findMany({
      where: {
        totalApproved: { gt: 0 },
        isSuspended: false,
      },
      orderBy: { totalApproved: 'desc' },
      take: 50,
      select: {
        walletAddress: true,
        totalApproved: true,
      },
    });

    // Calculate total rewards for each user
    const leaderboard = await Promise.all(
      topUsers.map(async (user, index) => {
        const rewardsResult = await prisma.$queryRaw<[{ total: number }]>`
          SELECT COALESCE(SUM(t.reward_amount), 0) as total
          FROM task_submissions ts
          JOIN tasks t ON ts.task_id = t.id
          WHERE ts.user_id = (SELECT id FROM platform_users WHERE wallet_address = ${user.walletAddress})
          AND ts.status IN ('APPROVED', 'REWARD_PENDING', 'REWARD_PAID')
        `;

        return {
          rank: index + 1,
          walletAddress: user.walletAddress.slice(0, 4) + '...' + user.walletAddress.slice(-4),
          tasksCompleted: user.totalApproved,
          totalRewards: rewardsResult[0]?.total || 0,
        };
      })
    );

    res.json(successResponse({
      entries: leaderboard,
      totalUsers: topUsers.length,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
