CREATE TABLE `MatchSession` (
  `matchId` VARCHAR(191) NOT NULL,
  `mode` ENUM('ALTERNATING','FREE') NOT NULL DEFAULT 'ALTERNATING',
  `wrongPenalty` INTEGER NOT NULL DEFAULT 0,
  `defaultDurationSeconds` INTEGER NOT NULL DEFAULT 30,
  `currentPosition` INTEGER NULL,
  `turnTeamId` VARCHAR(191) NULL,
  `timerState` ENUM('IDLE','RUNNING','PAUSED') NOT NULL DEFAULT 'IDLE',
  `timerRemainingMs` INTEGER NOT NULL DEFAULT 30000,
  `timerStartedAt` DATETIME(3) NULL,
  `startedAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `revision` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`matchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `MatchEvent` (
  `id` VARCHAR(191) NOT NULL,
  `matchId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `details` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `MatchEvent_matchId_createdAt_idx`(`matchId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Answer` ADD COLUMN `assignmentId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Answer_assignmentId_teamId_key` ON `Answer`(`assignmentId`, `teamId`);
ALTER TABLE `MatchSession` ADD CONSTRAINT `MatchSession_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MatchEvent` ADD CONSTRAINT `MatchEvent_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Answer` ADD CONSTRAINT `Answer_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `QuestionUse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
