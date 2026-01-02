// =============================================================================
// SEED SCRIPT - Create initial admin user and sample data
// =============================================================================
// Run: npx tsx src/scripts/seed.ts
// =============================================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  // Create super admin
  const password = 'admin123456789'; // Change in production!
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  console.log('Created super admin:');
  console.log(`  Email: ${admin.email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role: ${admin.role}\n`);

  // Create tasks matching the frontend SOBER app
  const tasks = [
    // Alcohol-Free Tasks
    {
      name: 'Environment Reset',
      description: 'Clear your living space of alcohol. Upload a photo showing your alcohol-free environment.',
      category: 'alcohol_free',
      rewardAmount: 0.03,
      rewardToken: 'SOL',
    },
    {
      name: '7-Day Alcohol Free',
      description: 'Complete 7 consecutive daily check-ins without alcohol consumption.',
      category: 'alcohol_free',
      rewardAmount: 0.05,
      rewardToken: 'SOL',
    },
    {
      name: '30-Day Milestone',
      description: 'Achieve 30 days of sobriety. A major milestone in your journey!',
      category: 'alcohol_free',
      rewardAmount: 0.1,
      rewardToken: 'SOL',
      maxSubmissions: 1,
    },
    // Smoke-Free Tasks
    {
      name: 'Smoke-Free Zone',
      description: 'Remove all smoking materials from your space. Upload proof of your clean environment.',
      category: 'smoke_free',
      rewardAmount: 0.03,
      rewardToken: 'SOL',
    },
    {
      name: '7-Day Smoke Free',
      description: 'Complete 7 consecutive days without smoking. Daily check-ins required.',
      category: 'smoke_free',
      rewardAmount: 0.05,
      rewardToken: 'SOL',
    },
    // Fitness Tasks
    {
      name: 'Healthy Body Challenge',
      description: 'Complete a workout session. Upload a gym selfie or workout screenshot.',
      category: 'fitness',
      rewardAmount: 0.02,
      rewardToken: 'SOL',
    },
    {
      name: '7-Day Active Streak',
      description: 'Exercise for 7 consecutive days. Any form of physical activity counts!',
      category: 'fitness',
      rewardAmount: 0.04,
      rewardToken: 'SOL',
    },
    // Mindfulness Tasks
    {
      name: 'Mindful Moment',
      description: 'Complete a 10-minute meditation session. Upload a screenshot from your meditation app.',
      category: 'mindfulness',
      rewardAmount: 0.015,
      rewardToken: 'SOL',
    },
    {
      name: 'Reflection Journal',
      description: 'Write about your sobriety journey. Share your wins and challenges (privacy-safe).',
      category: 'mindfulness',
      rewardAmount: 0.02,
      rewardToken: 'SOL',
    },
    // Community Tasks
    {
      name: 'Sober Buddy Referral',
      description: 'Refer a friend who joins and completes their first task. Stronger together!',
      category: 'community',
      rewardAmount: 0.05,
      rewardToken: 'SOL',
    },
    {
      name: 'Share Your Story',
      description: 'Share your sobriety journey on social media (Twitter/X). Inspire others!',
      category: 'community',
      rewardAmount: 0.03,
      rewardToken: 'SOL',
    },
    // Accountability Tasks
    {
      name: 'Daily Check-In',
      description: 'Complete your daily sobriety check-in. Consistency is key!',
      category: 'accountability',
      rewardAmount: 0.01,
      rewardToken: 'SOL',
    },
    {
      name: 'Weekly Reflection',
      description: 'Complete your weekly progress review. Celebrate your wins!',
      category: 'accountability',
      rewardAmount: 0.015,
      rewardToken: 'SOL',
    },
  ];

  for (const taskData of tasks) {
    const task = await prisma.task.upsert({
      where: { id: taskData.name.toLowerCase().replace(/\s/g, '-') },
      update: {
        name: taskData.name,
        description: taskData.description,
        category: taskData.category,
        rewardAmount: taskData.rewardAmount,
        rewardToken: taskData.rewardToken,
      },
      create: {
        id: taskData.name.toLowerCase().replace(/\s/g, '-'),
        ...taskData,
        rewardAmount: taskData.rewardAmount,
      },
    });
    console.log(`Created task: ${task.name}`);
  }

  console.log('\nSeeding complete!');
  console.log('\nYou can now login at http://localhost:3001 with:');
  console.log('  Email: admin@example.com');
  console.log('  Password: admin123456789');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
