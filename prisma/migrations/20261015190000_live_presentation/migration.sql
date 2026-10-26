CREATE TABLE `EventPresentation` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `mode` ENUM('OPENING', 'TEAMS', 'QUESTION', 'REVEAL', 'SCORE', 'STANDINGS', 'BRACKET', 'CHAMPION') NOT NULL DEFAULT 'OPENING',
    `matchId` VARCHAR(191) NULL,
    `logoUrl` TEXT NULL,
    `welcomeMessage` TEXT NULL,
    `showQuestionScore` BOOLEAN NOT NULL DEFAULT true,
    `showExplanation` BOOLEAN NOT NULL DEFAULT false,
    `soundsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventPresentation_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EventPresentation` ADD CONSTRAINT `EventPresentation_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
