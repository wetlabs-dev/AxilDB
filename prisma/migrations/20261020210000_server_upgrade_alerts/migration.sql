ALTER TABLE "EmailPreference"
ADD COLUMN "serverUpgradeCompletedEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "serverUpgradeCompletedPushEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "serverUpgradeFailedEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "serverUpgradeFailedPushEnabled" BOOLEAN NOT NULL DEFAULT false;
