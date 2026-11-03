-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(50) NULL,
    `last_name` VARCHAR(50) NULL,
    `display_name` VARCHAR(100) NULL,
    `nickname` VARCHAR(100) NOT NULL,
    `dob` DATE NULL,
    `bio` VARCHAR(500) NULL,
    `avatar_url` VARCHAR(255) NULL,
    `email_verified` BOOLEAN NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `locked` BOOLEAN NOT NULL,
    `account_status` ENUM('ACTIVE', 'CANCELLED') NOT NULL,
    `follower_count` BIGINT NOT NULL,
    `following_count` BIGINT NOT NULL,
    `video_count` BIGINT NOT NULL,
    `created_at` DATETIME(6) NOT NULL,
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `uk_users_username`(`username`),
    UNIQUE INDEX `uk_users_email`(`email`),
    INDEX `idx_users_username`(`username`),
    INDEX `idx_users_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role` (
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` VARCHAR(36) NOT NULL,
    `role_id` VARCHAR(255) NOT NULL,

    INDEX `idx_user_roles_user_id`(`user_id`),
    INDEX `idx_user_roles_role_id`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invalidated_token` (
    `id` VARCHAR(255) NOT NULL,
    `expiry_time` DATETIME(6) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `videos` (
    `id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(60) NOT NULL,
    `video_url` VARCHAR(1000) NOT NULL,
    `cover_url` VARCHAR(1000) NULL,
    `author_id` VARCHAR(36) NOT NULL,
    `status` ENUM('APPROVED', 'REJECTED', 'REVIEWING', 'TAKEN_DOWN') NOT NULL,
    `reject_reason` VARCHAR(500) NULL,
    `like_count` BIGINT NOT NULL,
    `view_count` BIGINT NOT NULL,
    `comment_count` BIGINT NOT NULL DEFAULT 0,
    `published_at` DATETIME(6) NULL,
    `approved_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL,
    `updated_at` DATETIME(6) NOT NULL,

    INDEX `idx_videos_status`(`status`),
    INDEX `idx_videos_author_id`(`author_id`),
    INDEX `idx_videos_approved_at`(`approved_at`),
    INDEX `idx_videos_created_at`(`created_at`),
    INDEX `idx_videos_latest_cursor`(`status`, `approved_at`, `created_at`, `id`),
    INDEX `idx_videos_my_cursor`(`author_id`, `status`, `created_at`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_likes` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `video_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL,

    INDEX `idx_video_likes_user_id`(`user_id`),
    INDEX `idx_video_likes_video_id`(`video_id`),
    UNIQUE INDEX `uk_video_likes_user_video`(`user_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_follows` (
    `id` VARCHAR(36) NOT NULL,
    `follower_id` VARCHAR(36) NOT NULL,
    `author_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL,

    INDEX `idx_user_follows_follower_id`(`follower_id`),
    INDEX `idx_user_follows_author_id`(`author_id`),
    UNIQUE INDEX `uk_user_follows_follower_author`(`follower_id`, `author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_comments` (
    `id` VARCHAR(36) NOT NULL,
    `video_id` VARCHAR(36) NOT NULL,
    `author_id` VARCHAR(36) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `status` ENUM('DELETED', 'VISIBLE') NOT NULL,
    `created_at` DATETIME(6) NOT NULL,
    `updated_at` DATETIME(6) NOT NULL,
    `deleted_at` DATETIME(6) NULL,

    INDEX `idx_video_comments_video_status_created`(`video_id`, `status`, `created_at`),
    INDEX `idx_video_comments_author_id`(`author_id`),
    INDEX `idx_videos_comments_cursor`(`video_id`, `created_at`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`name`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_likes` ADD CONSTRAINT `video_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_likes` ADD CONSTRAINT `video_likes_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_follows` ADD CONSTRAINT `user_follows_follower_id_fkey` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_follows` ADD CONSTRAINT `user_follows_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
