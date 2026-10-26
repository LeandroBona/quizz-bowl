-- AlterTable
ALTER TABLE `Event` ADD COLUMN `isDemo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `EventPresentation` ADD COLUMN `accentColor` VARCHAR(191) NOT NULL DEFAULT '#38BDF8',
    ADD COLUMN `backgroundColor` VARCHAR(191) NOT NULL DEFAULT '#06142E';

-- CreateTable
CREATE TABLE `EventSettings` (
    `eventId` VARCHAR(191) NOT NULL,
    `teamCount` INTEGER NOT NULL DEFAULT 21,
    `minMembers` INTEGER NOT NULL DEFAULT 5,
    `maxMembers` INTEGER NOT NULL DEFAULT 6,
    `groupCount` INTEGER NOT NULL DEFAULT 7,
    `teamsPerGroup` INTEGER NULL DEFAULT 3,
    `qualifiersPerGroup` INTEGER NOT NULL DEFAULT 2,
    `winPoints` INTEGER NOT NULL DEFAULT 3,
    `drawPoints` INTEGER NOT NULL DEFAULT 1,
    `lossPoints` INTEGER NOT NULL DEFAULT 0,
    `allowDraws` BOOLEAN NOT NULL DEFAULT false,
    `tieBreakers` JSON NOT NULL,
    `bracketMode` ENUM('SEEDED', 'RANDOM') NOT NULL DEFAULT 'SEEDED',
    `avoidSameGroup` BOOLEAN NOT NULL DEFAULT true,
    `bracketTieRule` ENUM('SCORE', 'MANUAL') NOT NULL DEFAULT 'SCORE',
    `questionsPerMatch` INTEGER NOT NULL DEFAULT 5,
    `responseSeconds` INTEGER NOT NULL DEFAULT 30,
    `wrongPenalty` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DemoRun` (
    `eventId` VARCHAR(191) NOT NULL,
    `stage` INTEGER NOT NULL DEFAULT 0,
    `seed` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventSettings` ADD CONSTRAINT `EventSettings_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoRun` ADD CONSTRAINT `DemoRun_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
