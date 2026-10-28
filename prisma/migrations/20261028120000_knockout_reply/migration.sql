-- A tréplica permite que a primeira equipe responda novamente à mesma questão.
CREATE INDEX `Answer_assignmentId_teamId_idx` ON `Answer`(`assignmentId`, `teamId`);
DROP INDEX `Answer_assignmentId_teamId_key` ON `Answer`;

-- O regulamento vigente aceita empates na fase de grupos.
UPDATE `EventSettings` SET `allowDraws` = 1;
UPDATE `GroupPhase` SET `allowDraws` = 1;
ALTER TABLE `EventSettings` MODIFY `allowDraws` BOOLEAN NOT NULL DEFAULT true;
