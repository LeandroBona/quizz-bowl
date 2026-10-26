-- AlterTable
ALTER TABLE `Participant` ADD COLUMN `className` VARCHAR(191) NULL,
    ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
    ADD COLUMN `participationStatus` ENUM('ACTIVE', 'INACTIVE', 'WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `phaseId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Team` ADD COLUMN `maxMembers` INTEGER NULL,
    ADD COLUMN `minMembers` INTEGER NULL;

-- CreateTable
CREATE TABLE `CoursePhase` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CoursePhase_eventId_sortOrder_idx`(`eventId`, `sortOrder`),
    UNIQUE INDEX `CoursePhase_eventId_name_key`(`eventId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Participant_eventId_phaseId_participationStatus_idx` ON `Participant`(`eventId`, `phaseId`, `participationStatus`);

-- CreateIndex
CREATE UNIQUE INDEX `Participant_eventId_dedupeKey_key` ON `Participant`(`eventId`, `dedupeKey`);

-- AddForeignKey
ALTER TABLE `CoursePhase` ADD CONSTRAINT `CoursePhase_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_phaseId_fkey` FOREIGN KEY (`phaseId`) REFERENCES `CoursePhase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

