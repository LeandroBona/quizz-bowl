-- AlterTable
ALTER TABLE `Question` ADD COLUMN `alternatives` JSON NULL,
    ADD COLUMN `explanation` TEXT NULL,
    ADD COLUMN `imageUrl` LONGTEXT NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
    ADD COLUMN `timeSeconds` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `type` ENUM('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER') NOT NULL DEFAULT 'SHORT_ANSWER',
    MODIFY `eventId` VARCHAR(191) NULL;

-- Existing ready questions remain available after the migration.
UPDATE `Question` SET `isActive` = true WHERE `status` = 'READY';

-- CreateTable
CREATE TABLE `QuestionSettings` (
    `eventId` VARCHAR(191) NOT NULL,
    `pointsMode` ENUM('BY_DIFFICULTY', 'FIXED') NOT NULL DEFAULT 'BY_DIFFICULTY',
    `easyPoints` INTEGER NOT NULL DEFAULT 10,
    `mediumPoints` INTEGER NOT NULL DEFAULT 20,
    `hardPoints` INTEGER NOT NULL DEFAULT 30,
    `fixedPoints` INTEGER NOT NULL DEFAULT 10,
    `noRepeat` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionUse` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `awardedPoints` INTEGER NOT NULL,
    `status` ENUM('ASSIGNED', 'REVEALED') NOT NULL DEFAULT 'ASSIGNED',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revealedAt` DATETIME(3) NULL,

    INDEX `QuestionUse_eventId_questionId_idx`(`eventId`, `questionId`),
    UNIQUE INDEX `QuestionUse_matchId_questionId_key`(`matchId`, `questionId`),
    UNIQUE INDEX `QuestionUse_matchId_position_key`(`matchId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventQuestionReservation` (
    `eventId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventQuestionReservation_questionId_idx`(`questionId`),
    PRIMARY KEY (`eventId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Question_eventId_isActive_difficulty_idx` ON `Question`(`eventId`, `isActive`, `difficulty`);

-- CreateIndex
CREATE UNIQUE INDEX `Question_dedupeKey_key` ON `Question`(`dedupeKey`);

-- AddForeignKey
ALTER TABLE `QuestionSettings` ADD CONSTRAINT `QuestionSettings_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionUse` ADD CONSTRAINT `QuestionUse_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionUse` ADD CONSTRAINT `QuestionUse_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionUse` ADD CONSTRAINT `QuestionUse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventQuestionReservation` ADD CONSTRAINT `EventQuestionReservation_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventQuestionReservation` ADD CONSTRAINT `EventQuestionReservation_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
