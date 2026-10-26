CREATE TABLE `GroupPhase` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL DEFAULT 'Fase de grupos',
  `groupCount` INTEGER NOT NULL,
  `teamsPerGroup` INTEGER NULL,
  `qualifiersPerGroup` INTEGER NOT NULL,
  `winPoints` INTEGER NOT NULL DEFAULT 3,
  `drawPoints` INTEGER NOT NULL DEFAULT 1,
  `lossPoints` INTEGER NOT NULL DEFAULT 0,
  `allowDraws` BOOLEAN NOT NULL DEFAULT true,
  `tieBreakers` JSON NOT NULL,
  `format` ENUM('ROUND_ROBIN_SINGLE') NOT NULL DEFAULT 'ROUND_ROBIN_SINGLE',
  `confirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GroupPhase_eventId_name_key`(`eventId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Group` ADD COLUMN `phaseId` VARCHAR(191) NULL;
ALTER TABLE `GroupTeam` ADD COLUMN `phaseId` VARCHAR(191) NULL, ADD COLUMN `manualTieRank` INTEGER NULL;
ALTER TABLE `Match` ADD COLUMN `officialAt` DATETIME(3) NULL, ADD COLUMN `fixtureKey` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `GroupTeam_phaseId_teamId_key` ON `GroupTeam`(`phaseId`, `teamId`);
CREATE UNIQUE INDEX `Match_fixtureKey_key` ON `Match`(`fixtureKey`);
ALTER TABLE `GroupPhase` ADD CONSTRAINT `GroupPhase_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Group` ADD CONSTRAINT `Group_phaseId_fkey` FOREIGN KEY (`phaseId`) REFERENCES `GroupPhase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GroupTeam` ADD CONSTRAINT `GroupTeam_phaseId_fkey` FOREIGN KEY (`phaseId`) REFERENCES `GroupPhase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
