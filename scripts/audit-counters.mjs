import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const result = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM videos v WHERE v.like_count <> (SELECT COUNT(*) FROM video_likes l WHERE l.video_id = v.id)) AS video_like_mismatches,
      (SELECT COUNT(*) FROM videos v WHERE v.comment_count <> (SELECT COUNT(*) FROM video_comments c WHERE c.video_id = v.id AND c.status = 'VISIBLE')) AS video_comment_mismatches,
      (SELECT COUNT(*) FROM users u WHERE u.follower_count <> (SELECT COUNT(*) FROM user_follows f WHERE f.author_id = u.id)
        OR u.following_count <> (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = u.id)
        OR u.video_count <> (SELECT COUNT(*) FROM videos v WHERE v.author_id = u.id)) AS user_counter_mismatches
  `;
  process.stdout.write(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
} finally {
  await db.$disconnect();
}
