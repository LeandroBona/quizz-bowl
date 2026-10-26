-- CreateTable
CREATE TABLE `Bracket` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `phaseId` VARCHAR(191) NOT NULL,
    `mode` ENUM('SEEDED', 'RANDOM') NOT NULL DEFAULT 'SEEDED',
    `avoidSameGroup` BOOLEAN NOT NULL DEFAULT true,
    `tieRule` ENUM('SCORE', 'MANUAL') NOT NULL DEFAULT 'SCORE',
    `teamCount` INTEGER NOT NULL,
    `bracketSize` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Bracket_phaseId_key`(`phaseId`),
    INDEX `Bracket_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BracketNode` (
    `id` VARCHAR(191) NOT NULL,
    `bracketId` VARCHAR(191) NOT NULL,
    `roundIndex` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `winnerTeamId` VARCHAR(191) NULL,
    `winnerReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BracketNode_matchId_key`(`matchId`),
    INDEX `BracketNode_winnerTeamId_idx`(`winnerTeamId`),
    UNIQUE INDEX `BracketNode_bracketId_roundIndex_position_key`(`bracketId`, `roundIndex`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BracketSlot` (
    `id` VARCHAR(191) NOT NULL,
    `bracketId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `roundIndex` INTEGER NOT NULL,
    `side` INTEGER NOT NULL,
    `teamId` VARCHAR(191) NULL,
    `sourceNodeId` VARCHAR(191) NULL,
    `seed` INTEGER NULL,

    UNIQUE INDEX `BracketSlot_sourceNodeId_key`(`sourceNodeId`),
    INDEX `BracketSlot_teamId_idx`(`teamId`),
    UNIQUE INDEX `BracketSlot_nodeId_side_key`(`nodeId`, `side`),
    UNIQUE INDEX `BracketSlot_bracketId_roundIndex_teamId_key`(`bracketId`, `roundIndex`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BracketEvent` (
    `id` VARCHAR(191) NOT NULL,
    `bracketId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `details` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BracketEvent_bracketId_createdAt_idx`(`bracketId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Bracket` ADD CONSTRAINT `Bracket_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bracket` ADD CONSTRAINT `Bracket_phaseId_fkey` FOREIGN KEY (`phaseId`) REFERENCES `GroupPhase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketNode` ADD CONSTRAINT `BracketNode_bracketId_fkey` FOREIGN KEY (`bracketId`) REFERENCES `Bracket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketNode` ADD CONSTRAINT `BracketNode_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketNode` ADD CONSTRAINT `BracketNode_winnerTeamId_fkey` FOREIGN KEY (`winnerTeamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketSlot` ADD CONSTRAINT `BracketSlot_bracketId_fkey` FOREIGN KEY (`bracketId`) REFERENCES `Bracket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketSlot` ADD CONSTRAINT `BracketSlot_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `BracketNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketSlot` ADD CONSTRAINT `BracketSlot_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketSlot` ADD CONSTRAINT `BracketSlot_sourceNodeId_fkey` FOREIGN KEY (`sourceNodeId`) REFERENCES `BracketNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BracketEvent` ADD CONSTRAINT `BracketEvent_bracketId_fkey` FOREIGN KEY (`bracketId`) REFERENCES `Bracket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
