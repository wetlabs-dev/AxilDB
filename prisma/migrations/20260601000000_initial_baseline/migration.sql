-- CreateTable
CREATE TABLE "GoverningBody" (
    "collectionId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "website" TEXT,
    "notes" TEXT,

    CONSTRAINT "GoverningBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "aiFeaturesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionMembership" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionInvitation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inviterId" TEXT NOT NULL,
    "acceptedUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionTransferConnection" (
    "id" TEXT NOT NULL,
    "sourceCollectionId" TEXT NOT NULL,
    "targetCollectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "respondedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "requestNote" TEXT,
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionTransferConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantTransferRequest" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sourceCollectionId" TEXT NOT NULL,
    "targetCollectionId" TEXT NOT NULL,
    "sourcePlantInstanceId" TEXT NOT NULL,
    "targetPlantInstanceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "senderNote" TEXT,
    "receiverNote" TEXT,
    "previewSnapshot" JSONB NOT NULL,
    "transferManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantDefinitionShareRequest" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sourceCollectionId" TEXT NOT NULL,
    "targetCollectionId" TEXT NOT NULL,
    "sourcePlantDefinitionId" TEXT NOT NULL,
    "targetPlantDefinitionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "senderNote" TEXT,
    "receiverNote" TEXT,
    "previewSnapshot" JSONB NOT NULL,
    "transferManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantDefinitionShareRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "collectionId" TEXT,
    "requestedName" TEXT NOT NULL,
    "requestedSlug" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "description" TEXT,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAccessRequest" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rationale" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerMetricSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "ServerMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SITEWIDE',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "backupPath" TEXT,
    "manifest" JSONB,
    "log" TEXT,
    "error" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTwoFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "recoveryCodesCiphertext" TEXT,
    "recoveryCodesGeneratedAt" TIMESTAMP(3),
    "recoveryCodesViewedAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "userTwoFactorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "consumedByIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "authSecurityEmails" BOOLEAN NOT NULL DEFAULT true,
    "welcomeEmails" BOOLEAN NOT NULL DEFAULT true,
    "generalReminders" BOOLEAN NOT NULL DEFAULT true,
    "plantCheckInReminders" BOOLEAN NOT NULL DEFAULT true,
    "bloomCycleReminders" BOOLEAN NOT NULL DEFAULT true,
    "propagationFollowUps" BOOLEAN NOT NULL DEFAULT true,
    "followNotifications" BOOLEAN NOT NULL DEFAULT true,
    "transferNotifications" BOOLEAN NOT NULL DEFAULT true,
    "careQueueDigestEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "serverHealthEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "generalRemindersPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "plantCheckInRemindersPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bloomCycleRemindersPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "propagationFollowUpsPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followNotificationsPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "careQueueDigestPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serverHealthPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "careQueueDigestLastSentAt" TIMESTAMP(3),
    "serverHealthAlertLastSentAt" TIMESTAMP(3),
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSortPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSortPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowNotification" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "followId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "recordUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantDefinition" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "genus" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "hybridNotation" TEXT,
    "cultivarName" TEXT,
    "authority" TEXT,
    "cultivarRegistrationNumber" TEXT,
    "governingBodyId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'UNCERTAIN',
    "acquisitionLabel" TEXT,
    "provisionalTaxon" TEXT,
    "wikipediaUrl" TEXT,
    "inaturalistUrl" TEXT,
    "powoUrl" TEXT,
    "gbifUrl" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantHusbandryGuide" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantDefinitionId" TEXT NOT NULL,
    "sourcePlantDefinitionId" TEXT,
    "summaryWater" TEXT,
    "summaryLight" TEXT,
    "summaryToxicity" TEXT,
    "summaryCare" TEXT,
    "wateringCadence" TEXT,
    "wateringMoistureLevel" TEXT,
    "wateringDroughtTolerance" TEXT,
    "wateringCycleNotes" TEXT,
    "wateringSeasonalAdjustments" TEXT,
    "lightIntensity" TEXT,
    "lightDuration" TEXT,
    "temperatureUsdaZone" TEXT,
    "temperatureColdTolerance" TEXT,
    "temperatureHeatTolerance" TEXT,
    "temperatureFrostSensitivity" TEXT,
    "temperatureOverwinterInstructions" TEXT,
    "humidityRange" TEXT,
    "humidityDryAirTolerance" TEXT,
    "humidityMistingNotes" TEXT,
    "mediumPreferred" TEXT,
    "mediumPh" TEXT,
    "mediumDrainage" TEXT,
    "mediumHabit" TEXT,
    "mediumRecipeNotes" TEXT,
    "fertilizationType" TEXT,
    "fertilizationStrength" TEXT,
    "fertilizationFrequency" TEXT,
    "fertilizationSeasonalSchedule" TEXT,
    "fertilizationMicronutrientNotes" TEXT,
    "repottingInterval" TEXT,
    "repottingPotType" TEXT,
    "repottingRootSensitivity" TEXT,
    "repottingDormancyConsideration" TEXT,
    "repottingDivisionGuidance" TEXT,
    "propagationMethods" TEXT,
    "propagationDifficulty" TEXT,
    "propagationExpectedSuccess" TEXT,
    "propagationOptimalTiming" TEXT,
    "propagationRootingHormoneNotes" TEXT,
    "propagationTissueCultureNotes" TEXT,
    "pestsCommon" TEXT,
    "diseasesCommon" TEXT,
    "treatmentNotes" TEXT,
    "susceptibilityLevel" TEXT,
    "preventativePractices" TEXT,
    "toxicityPets" TEXT,
    "toxicityHumans" TEXT,
    "toxicitySapIrritant" TEXT,
    "toxicityEdible" TEXT,
    "dormancyBehavior" TEXT,
    "bloomSeason" TEXT,
    "bloomDuration" TEXT,
    "bloomFragrance" TEXT,
    "bloomRebloomTendency" TEXT,
    "bloomTriggers" TEXT,
    "bloomPollinatorNotes" TEXT,
    "growthHabit" TEXT,
    "rarity" TEXT,
    "conservationStatus" TEXT,
    "conservationLinks" TEXT,
    "protectedSpeciesNotes" TEXT,
    "collectionRestrictions" TEXT,
    "importExportConcerns" TEXT,
    "invasiveness" TEXT,
    "nativeRangeNotes" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "aiModel" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantHusbandryGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAlias" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL DEFAULT 'SYNONYM',
    "source" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'UNCERTAIN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantInstance" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantDefinitionId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "instanceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "propagationDate" TIMESTAMP(3),
    "source" TEXT,
    "distributor" TEXT,
    "stockNumber" TEXT,
    "purchasePrice" DECIMAL(65,30),
    "archiveDate" TIMESTAMP(3),
    "archiveReason" TEXT,
    "archiveNotes" TEXT,
    "originCollectionSlug" TEXT,
    "originPlantId" TEXT,
    "transferredFromCollectionSlug" TEXT,
    "transferredFromPlantId" TEXT,
    "isSportCandidate" BOOLEAN NOT NULL DEFAULT false,
    "sportStatus" TEXT NOT NULL DEFAULT 'NONE',
    "sportDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantHusbandryOverride" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantInstanceId" TEXT NOT NULL,
    "summaryWater" TEXT,
    "summaryLight" TEXT,
    "summaryToxicity" TEXT,
    "summaryCare" TEXT,
    "wateringCadence" TEXT,
    "wateringMoistureLevel" TEXT,
    "wateringDroughtTolerance" TEXT,
    "wateringCycleNotes" TEXT,
    "wateringSeasonalAdjustments" TEXT,
    "lightIntensity" TEXT,
    "lightDuration" TEXT,
    "temperatureUsdaZone" TEXT,
    "temperatureColdTolerance" TEXT,
    "temperatureHeatTolerance" TEXT,
    "temperatureFrostSensitivity" TEXT,
    "temperatureOverwinterInstructions" TEXT,
    "humidityRange" TEXT,
    "humidityDryAirTolerance" TEXT,
    "humidityMistingNotes" TEXT,
    "mediumPreferred" TEXT,
    "mediumPh" TEXT,
    "mediumDrainage" TEXT,
    "mediumHabit" TEXT,
    "mediumRecipeNotes" TEXT,
    "fertilizationType" TEXT,
    "fertilizationStrength" TEXT,
    "fertilizationFrequency" TEXT,
    "fertilizationSeasonalSchedule" TEXT,
    "fertilizationMicronutrientNotes" TEXT,
    "repottingInterval" TEXT,
    "repottingPotType" TEXT,
    "repottingRootSensitivity" TEXT,
    "repottingDormancyConsideration" TEXT,
    "repottingDivisionGuidance" TEXT,
    "propagationMethods" TEXT,
    "propagationDifficulty" TEXT,
    "propagationExpectedSuccess" TEXT,
    "propagationOptimalTiming" TEXT,
    "propagationRootingHormoneNotes" TEXT,
    "propagationTissueCultureNotes" TEXT,
    "pestsCommon" TEXT,
    "diseasesCommon" TEXT,
    "treatmentNotes" TEXT,
    "susceptibilityLevel" TEXT,
    "preventativePractices" TEXT,
    "toxicityPets" TEXT,
    "toxicityHumans" TEXT,
    "toxicitySapIrritant" TEXT,
    "toxicityEdible" TEXT,
    "dormancyBehavior" TEXT,
    "bloomSeason" TEXT,
    "bloomDuration" TEXT,
    "bloomFragrance" TEXT,
    "bloomRebloomTendency" TEXT,
    "bloomTriggers" TEXT,
    "bloomPollinatorNotes" TEXT,
    "growthHabit" TEXT,
    "rarity" TEXT,
    "conservationStatus" TEXT,
    "conservationLinks" TEXT,
    "protectedSpeciesNotes" TEXT,
    "collectionRestrictions" TEXT,
    "importExportConcerns" TEXT,
    "invasiveness" TEXT,
    "nativeRangeNotes" TEXT,
    "overrideNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantHusbandryOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantCareEvent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantInstanceId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantCareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantCondition" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantInstanceId" TEXT NOT NULL,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantCareAdjustment" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantInstanceId" TEXT NOT NULL,
    "userId" TEXT,
    "taskType" TEXT NOT NULL,
    "cadenceOverrideDays" INTEGER,
    "snoozedUntil" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantCareAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSheet" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CARE_SHEET',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "publicTokenHash" TEXT,
    "sections" JSONB NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSheetPlant" (
    "id" TEXT NOT NULL,
    "careSheetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "displayOrder" INTEGER,
    "notes" TEXT,

    CONSTRAINT "CareSheetPlant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSheetTask" (
    "id" TEXT NOT NULL,
    "careSheetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT,
    "taskType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedByName" TEXT,
    "completedByUserId" TEXT,
    "notes" TEXT,
    "sourceCareQueueKey" TEXT,
    "sourceReminderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareSheetTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSheetAccessLog" (
    "id" TEXT NOT NULL,
    "careSheetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "action" TEXT,

    CONSTRAINT "CareSheetAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropagationEvent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "method" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "successStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropagationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentageLink" (
    "id" TEXT NOT NULL,
    "propagationEventId" TEXT NOT NULL,
    "parentPlantInstanceId" TEXT NOT NULL,
    "parentRole" TEXT NOT NULL,

    CONSTRAINT "ParentageLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropagationChild" (
    "id" TEXT NOT NULL,
    "propagationEventId" TEXT NOT NULL,
    "childPlantInstanceId" TEXT NOT NULL,

    CONSTRAINT "PropagationChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "caption" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "cropX" DOUBLE PRECISION,
    "cropY" DOUBLE PRECISION,
    "cropWidth" DOUBLE PRECISION,
    "cropHeight" DOUBLE PRECISION,
    "focalX" DOUBLE PRECISION,
    "focalY" DOUBLE PRECISION,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "isType" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloomEvent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "plantInstanceId" TEXT NOT NULL,
    "bloomStartDate" TIMESTAMP(3) NOT NULL,
    "peakBloomDate" TIMESTAMP(3),
    "bloomEndDate" TIMESTAMP(3),
    "flowerCount" INTEGER,
    "firstBloom" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportStabilityRecord" (
    "id" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "propagationEventId" TEXT NOT NULL,
    "propagatedTrue" BOOLEAN NOT NULL,
    "generationNumber" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SportStabilityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "entityType" TEXT,
    "entityId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "rrule" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "nextSendAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "reminderId" TEXT NOT NULL,
    "userId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoverningBody_collectionId_idx" ON "GoverningBody"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_visibility_idx" ON "Collection"("visibility");

-- CreateIndex
CREATE INDEX "Collection_status_idx" ON "Collection"("status");

-- CreateIndex
CREATE INDEX "Collection_isDefault_idx" ON "Collection"("isDefault");

-- CreateIndex
CREATE INDEX "Collection_aiFeaturesEnabled_idx" ON "Collection"("aiFeaturesEnabled");

-- CreateIndex
CREATE INDEX "CollectionMembership_collectionId_idx" ON "CollectionMembership"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionMembership_userId_idx" ON "CollectionMembership"("userId");

-- CreateIndex
CREATE INDEX "CollectionMembership_role_idx" ON "CollectionMembership"("role");

-- CreateIndex
CREATE INDEX "CollectionMembership_status_idx" ON "CollectionMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionMembership_collectionId_userId_key" ON "CollectionMembership"("collectionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionInvitation_tokenHash_key" ON "CollectionInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "CollectionInvitation_collectionId_idx" ON "CollectionInvitation"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionInvitation_email_idx" ON "CollectionInvitation"("email");

-- CreateIndex
CREATE INDEX "CollectionInvitation_status_idx" ON "CollectionInvitation"("status");

-- CreateIndex
CREATE INDEX "CollectionInvitation_expiresAt_idx" ON "CollectionInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "CollectionTransferConnection_sourceCollectionId_idx" ON "CollectionTransferConnection"("sourceCollectionId");

-- CreateIndex
CREATE INDEX "CollectionTransferConnection_targetCollectionId_idx" ON "CollectionTransferConnection"("targetCollectionId");

-- CreateIndex
CREATE INDEX "CollectionTransferConnection_status_idx" ON "CollectionTransferConnection"("status");

-- CreateIndex
CREATE INDEX "CollectionTransferConnection_requestedAt_idx" ON "CollectionTransferConnection"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionTransferConnection_sourceCollectionId_targetColle_key" ON "CollectionTransferConnection"("sourceCollectionId", "targetCollectionId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_connectionId_idx" ON "PlantTransferRequest"("connectionId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_sourceCollectionId_idx" ON "PlantTransferRequest"("sourceCollectionId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_targetCollectionId_idx" ON "PlantTransferRequest"("targetCollectionId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_sourcePlantInstanceId_idx" ON "PlantTransferRequest"("sourcePlantInstanceId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_targetPlantInstanceId_idx" ON "PlantTransferRequest"("targetPlantInstanceId");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_status_idx" ON "PlantTransferRequest"("status");

-- CreateIndex
CREATE INDEX "PlantTransferRequest_requestedAt_idx" ON "PlantTransferRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_connectionId_idx" ON "PlantDefinitionShareRequest"("connectionId");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_sourceCollectionId_idx" ON "PlantDefinitionShareRequest"("sourceCollectionId");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_targetCollectionId_idx" ON "PlantDefinitionShareRequest"("targetCollectionId");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_sourcePlantDefinitionId_idx" ON "PlantDefinitionShareRequest"("sourcePlantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_targetPlantDefinitionId_idx" ON "PlantDefinitionShareRequest"("targetPlantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_status_idx" ON "PlantDefinitionShareRequest"("status");

-- CreateIndex
CREATE INDEX "PlantDefinitionShareRequest_requestedAt_idx" ON "PlantDefinitionShareRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "CollectionRequest_requestedById_idx" ON "CollectionRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CollectionRequest_reviewedById_idx" ON "CollectionRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "CollectionRequest_collectionId_idx" ON "CollectionRequest"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionRequest_requestedSlug_idx" ON "CollectionRequest"("requestedSlug");

-- CreateIndex
CREATE INDEX "CollectionRequest_status_idx" ON "CollectionRequest"("status");

-- CreateIndex
CREATE INDEX "CollectionRequest_createdAt_idx" ON "CollectionRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AiAccessRequest_collectionId_idx" ON "AiAccessRequest"("collectionId");

-- CreateIndex
CREATE INDEX "AiAccessRequest_requestedById_idx" ON "AiAccessRequest"("requestedById");

-- CreateIndex
CREATE INDEX "AiAccessRequest_reviewedById_idx" ON "AiAccessRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "AiAccessRequest_status_idx" ON "AiAccessRequest"("status");

-- CreateIndex
CREATE INDEX "AiAccessRequest_createdAt_idx" ON "AiAccessRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_collectionId_idx" ON "AiUsageEvent"("collectionId");

-- CreateIndex
CREATE INDEX "AiUsageEvent_userId_idx" ON "AiUsageEvent"("userId");

-- CreateIndex
CREATE INDEX "AiUsageEvent_feature_idx" ON "AiUsageEvent"("feature");

-- CreateIndex
CREATE INDEX "AiUsageEvent_success_idx" ON "AiUsageEvent"("success");

-- CreateIndex
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ServerMetricSnapshot_capturedAt_idx" ON "ServerMetricSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "BackupRun_scope_idx" ON "BackupRun"("scope");

-- CreateIndex
CREATE INDEX "BackupRun_status_idx" ON "BackupRun"("status");

-- CreateIndex
CREATE INDEX "BackupRun_requestedAt_idx" ON "BackupRun"("requestedAt");

-- CreateIndex
CREATE INDEX "BackupRun_requestedById_idx" ON "BackupRun"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserTwoFactor_userId_key" ON "UserTwoFactor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_tokenHash_key" ON "TwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_consumedAt_idx" ON "TwoFactorChallenge"("consumedAt");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_userTwoFactorId_idx" ON "TwoFactorRecoveryCode"("userTwoFactorId");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_usedAt_idx" ON "TwoFactorRecoveryCode"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_userTwoFactorId_codeHash_key" ON "TwoFactorRecoveryCode"("userTwoFactorId", "codeHash");

-- CreateIndex
CREATE INDEX "AuditLog_collectionId_idx" ON "AuditLog"("collectionId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_idx" ON "EmailToken"("userId");

-- CreateIndex
CREATE INDEX "EmailToken_email_idx" ON "EmailToken"("email");

-- CreateIndex
CREATE INDEX "EmailToken_purpose_idx" ON "EmailToken"("purpose");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailToken_usedAt_idx" ON "EmailToken"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailPreference_userId_key" ON "EmailPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_enabled_idx" ON "PushSubscription"("enabled");

-- CreateIndex
CREATE INDEX "PushSubscription_revokedAt_idx" ON "PushSubscription"("revokedAt");

-- CreateIndex
CREATE INDEX "PushSubscription_lastSeenAt_idx" ON "PushSubscription"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserSortPreference_userId_idx" ON "UserSortPreference"("userId");

-- CreateIndex
CREATE INDEX "UserSortPreference_section_idx" ON "UserSortPreference"("section");

-- CreateIndex
CREATE UNIQUE INDEX "UserSortPreference_userId_section_key" ON "UserSortPreference"("userId", "section");

-- CreateIndex
CREATE INDEX "Follow_collectionId_idx" ON "Follow"("collectionId");

-- CreateIndex
CREATE INDEX "Follow_userId_idx" ON "Follow"("userId");

-- CreateIndex
CREATE INDEX "Follow_scope_entityType_entityId_idx" ON "Follow"("scope", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_collectionId_userId_scope_entityType_entityId_key" ON "Follow"("collectionId", "userId", "scope", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "FollowNotification_collectionId_idx" ON "FollowNotification"("collectionId");

-- CreateIndex
CREATE INDEX "FollowNotification_followId_idx" ON "FollowNotification"("followId");

-- CreateIndex
CREATE INDEX "FollowNotification_userId_idx" ON "FollowNotification"("userId");

-- CreateIndex
CREATE INDEX "FollowNotification_eventType_idx" ON "FollowNotification"("eventType");

-- CreateIndex
CREATE INDEX "FollowNotification_status_idx" ON "FollowNotification"("status");

-- CreateIndex
CREATE INDEX "FollowNotification_sentAt_idx" ON "FollowNotification"("sentAt");

-- CreateIndex
CREATE INDEX "PlantDefinition_collectionId_idx" ON "PlantDefinition"("collectionId");

-- CreateIndex
CREATE INDEX "PlantDefinition_governingBodyId_idx" ON "PlantDefinition"("governingBodyId");

-- CreateIndex
CREATE INDEX "PlantDefinition_confidence_idx" ON "PlantDefinition"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "PlantHusbandryGuide_plantDefinitionId_key" ON "PlantHusbandryGuide"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantHusbandryGuide_collectionId_idx" ON "PlantHusbandryGuide"("collectionId");

-- CreateIndex
CREATE INDEX "PlantHusbandryGuide_plantDefinitionId_idx" ON "PlantHusbandryGuide"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantHusbandryGuide_sourcePlantDefinitionId_idx" ON "PlantHusbandryGuide"("sourcePlantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantHusbandryGuide_reviewStatus_idx" ON "PlantHusbandryGuide"("reviewStatus");

-- CreateIndex
CREATE INDEX "PlantAlias_collectionId_idx" ON "PlantAlias"("collectionId");

-- CreateIndex
CREATE INDEX "PlantAlias_plantDefinitionId_idx" ON "PlantAlias"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantAlias_aliasType_idx" ON "PlantAlias"("aliasType");

-- CreateIndex
CREATE INDEX "PlantAlias_confidence_idx" ON "PlantAlias"("confidence");

-- CreateIndex
CREATE INDEX "PlantInstance_collectionId_idx" ON "PlantInstance"("collectionId");

-- CreateIndex
CREATE INDEX "PlantInstance_plantDefinitionId_idx" ON "PlantInstance"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantInstance_status_idx" ON "PlantInstance"("status");

-- CreateIndex
CREATE INDEX "PlantInstance_instanceType_idx" ON "PlantInstance"("instanceType");

-- CreateIndex
CREATE INDEX "PlantInstance_sportStatus_idx" ON "PlantInstance"("sportStatus");

-- CreateIndex
CREATE INDEX "PlantInstance_originCollectionSlug_originPlantId_idx" ON "PlantInstance"("originCollectionSlug", "originPlantId");

-- CreateIndex
CREATE INDEX "PlantInstance_transferredFromCollectionSlug_transferredFrom_idx" ON "PlantInstance"("transferredFromCollectionSlug", "transferredFromPlantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantInstance_collectionId_plantId_key" ON "PlantInstance"("collectionId", "plantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantHusbandryOverride_plantInstanceId_key" ON "PlantHusbandryOverride"("plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantHusbandryOverride_collectionId_idx" ON "PlantHusbandryOverride"("collectionId");

-- CreateIndex
CREATE INDEX "PlantHusbandryOverride_plantInstanceId_idx" ON "PlantHusbandryOverride"("plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantCareEvent_collectionId_idx" ON "PlantCareEvent"("collectionId");

-- CreateIndex
CREATE INDEX "PlantCareEvent_plantInstanceId_idx" ON "PlantCareEvent"("plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantCareEvent_userId_idx" ON "PlantCareEvent"("userId");

-- CreateIndex
CREATE INDEX "PlantCareEvent_eventType_idx" ON "PlantCareEvent"("eventType");

-- CreateIndex
CREATE INDEX "PlantCareEvent_performedAt_idx" ON "PlantCareEvent"("performedAt");

-- CreateIndex
CREATE INDEX "PlantCondition_collectionId_idx" ON "PlantCondition"("collectionId");

-- CreateIndex
CREATE INDEX "PlantCondition_plantInstanceId_idx" ON "PlantCondition"("plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantCondition_userId_idx" ON "PlantCondition"("userId");

-- CreateIndex
CREATE INDEX "PlantCondition_category_idx" ON "PlantCondition"("category");

-- CreateIndex
CREATE INDEX "PlantCondition_severity_idx" ON "PlantCondition"("severity");

-- CreateIndex
CREATE INDEX "PlantCondition_status_idx" ON "PlantCondition"("status");

-- CreateIndex
CREATE INDEX "PlantCondition_observedAt_idx" ON "PlantCondition"("observedAt");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_collectionId_idx" ON "PlantCareAdjustment"("collectionId");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_plantInstanceId_idx" ON "PlantCareAdjustment"("plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_userId_idx" ON "PlantCareAdjustment"("userId");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_taskType_idx" ON "PlantCareAdjustment"("taskType");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_snoozedUntil_idx" ON "PlantCareAdjustment"("snoozedUntil");

-- CreateIndex
CREATE INDEX "PlantCareAdjustment_disabled_idx" ON "PlantCareAdjustment"("disabled");

-- CreateIndex
CREATE UNIQUE INDEX "PlantCareAdjustment_collectionId_plantInstanceId_taskType_key" ON "PlantCareAdjustment"("collectionId", "plantInstanceId", "taskType");

-- CreateIndex
CREATE UNIQUE INDEX "CareSheet_publicTokenHash_key" ON "CareSheet"("publicTokenHash");

-- CreateIndex
CREATE INDEX "CareSheet_collectionId_idx" ON "CareSheet"("collectionId");

-- CreateIndex
CREATE INDEX "CareSheet_createdById_idx" ON "CareSheet"("createdById");

-- CreateIndex
CREATE INDEX "CareSheet_mode_idx" ON "CareSheet"("mode");

-- CreateIndex
CREATE INDEX "CareSheet_status_idx" ON "CareSheet"("status");

-- CreateIndex
CREATE INDEX "CareSheet_startsAt_idx" ON "CareSheet"("startsAt");

-- CreateIndex
CREATE INDEX "CareSheet_expiresAt_idx" ON "CareSheet"("expiresAt");

-- CreateIndex
CREATE INDEX "CareSheetPlant_careSheetId_idx" ON "CareSheetPlant"("careSheetId");

-- CreateIndex
CREATE INDEX "CareSheetPlant_collectionId_idx" ON "CareSheetPlant"("collectionId");

-- CreateIndex
CREATE INDEX "CareSheetPlant_plantInstanceId_idx" ON "CareSheetPlant"("plantInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "CareSheetPlant_careSheetId_plantInstanceId_key" ON "CareSheetPlant"("careSheetId", "plantInstanceId");

-- CreateIndex
CREATE INDEX "CareSheetTask_careSheetId_idx" ON "CareSheetTask"("careSheetId");

-- CreateIndex
CREATE INDEX "CareSheetTask_collectionId_idx" ON "CareSheetTask"("collectionId");

-- CreateIndex
CREATE INDEX "CareSheetTask_plantInstanceId_idx" ON "CareSheetTask"("plantInstanceId");

-- CreateIndex
CREATE INDEX "CareSheetTask_taskType_idx" ON "CareSheetTask"("taskType");

-- CreateIndex
CREATE INDEX "CareSheetTask_status_idx" ON "CareSheetTask"("status");

-- CreateIndex
CREATE INDEX "CareSheetTask_dueAt_idx" ON "CareSheetTask"("dueAt");

-- CreateIndex
CREATE INDEX "CareSheetTask_sourceReminderId_idx" ON "CareSheetTask"("sourceReminderId");

-- CreateIndex
CREATE INDEX "CareSheetAccessLog_careSheetId_idx" ON "CareSheetAccessLog"("careSheetId");

-- CreateIndex
CREATE INDEX "CareSheetAccessLog_collectionId_idx" ON "CareSheetAccessLog"("collectionId");

-- CreateIndex
CREATE INDEX "CareSheetAccessLog_accessedAt_idx" ON "CareSheetAccessLog"("accessedAt");

-- CreateIndex
CREATE INDEX "CareSheetAccessLog_action_idx" ON "CareSheetAccessLog"("action");

-- CreateIndex
CREATE INDEX "PropagationEvent_collectionId_idx" ON "PropagationEvent"("collectionId");

-- CreateIndex
CREATE INDEX "PropagationEvent_date_idx" ON "PropagationEvent"("date");

-- CreateIndex
CREATE INDEX "PropagationEvent_method_idx" ON "PropagationEvent"("method");

-- CreateIndex
CREATE INDEX "PropagationEvent_successStatus_idx" ON "PropagationEvent"("successStatus");

-- CreateIndex
CREATE INDEX "ParentageLink_propagationEventId_idx" ON "ParentageLink"("propagationEventId");

-- CreateIndex
CREATE INDEX "ParentageLink_parentPlantInstanceId_idx" ON "ParentageLink"("parentPlantInstanceId");

-- CreateIndex
CREATE INDEX "PropagationChild_propagationEventId_idx" ON "PropagationChild"("propagationEventId");

-- CreateIndex
CREATE INDEX "PropagationChild_childPlantInstanceId_idx" ON "PropagationChild"("childPlantInstanceId");

-- CreateIndex
CREATE INDEX "Note_collectionId_idx" ON "Note"("collectionId");

-- CreateIndex
CREATE INDEX "Note_entityType_entityId_idx" ON "Note"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Photo_collectionId_idx" ON "Photo"("collectionId");

-- CreateIndex
CREATE INDEX "Photo_entityType_entityId_idx" ON "Photo"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Photo_isCover_idx" ON "Photo"("isCover");

-- CreateIndex
CREATE INDEX "Photo_isType_idx" ON "Photo"("isType");

-- CreateIndex
CREATE INDEX "BloomEvent_collectionId_idx" ON "BloomEvent"("collectionId");

-- CreateIndex
CREATE INDEX "BloomEvent_plantInstanceId_idx" ON "BloomEvent"("plantInstanceId");

-- CreateIndex
CREATE INDEX "SportStabilityRecord_plantInstanceId_idx" ON "SportStabilityRecord"("plantInstanceId");

-- CreateIndex
CREATE INDEX "SportStabilityRecord_propagationEventId_idx" ON "SportStabilityRecord"("propagationEventId");

-- CreateIndex
CREATE INDEX "Reminder_collectionId_idx" ON "Reminder"("collectionId");

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- CreateIndex
CREATE INDEX "Reminder_category_idx" ON "Reminder"("category");

-- CreateIndex
CREATE INDEX "Reminder_entityType_entityId_idx" ON "Reminder"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Reminder_nextSendAt_idx" ON "Reminder"("nextSendAt");

-- CreateIndex
CREATE INDEX "Reminder_dueAt_idx" ON "Reminder"("dueAt");

-- CreateIndex
CREATE INDEX "ReminderDelivery_collectionId_idx" ON "ReminderDelivery"("collectionId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_reminderId_idx" ON "ReminderDelivery"("reminderId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_userId_idx" ON "ReminderDelivery"("userId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_status_idx" ON "ReminderDelivery"("status");

-- CreateIndex
CREATE INDEX "ReminderDelivery_sentAt_idx" ON "ReminderDelivery"("sentAt");

-- AddForeignKey
ALTER TABLE "GoverningBody" ADD CONSTRAINT "GoverningBody_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionInvitation" ADD CONSTRAINT "CollectionInvitation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionInvitation" ADD CONSTRAINT "CollectionInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionInvitation" ADD CONSTRAINT "CollectionInvitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTransferConnection" ADD CONSTRAINT "CollectionTransferConnection_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTransferConnection" ADD CONSTRAINT "CollectionTransferConnection_targetCollectionId_fkey" FOREIGN KEY ("targetCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTransferConnection" ADD CONSTRAINT "CollectionTransferConnection_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTransferConnection" ADD CONSTRAINT "CollectionTransferConnection_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CollectionTransferConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_targetCollectionId_fkey" FOREIGN KEY ("targetCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_sourcePlantInstanceId_fkey" FOREIGN KEY ("sourcePlantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_targetPlantInstanceId_fkey" FOREIGN KEY ("targetPlantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantTransferRequest" ADD CONSTRAINT "PlantTransferRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CollectionTransferConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_targetCollectionId_fkey" FOREIGN KEY ("targetCollectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_sourcePlantDefinitionId_fkey" FOREIGN KEY ("sourcePlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_targetPlantDefinitionId_fkey" FOREIGN KEY ("targetPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinitionShareRequest" ADD CONSTRAINT "PlantDefinitionShareRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAccessRequest" ADD CONSTRAINT "AiAccessRequest_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAccessRequest" ADD CONSTRAINT "AiAccessRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAccessRequest" ADD CONSTRAINT "AiAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTwoFactor" ADD CONSTRAINT "UserTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorChallenge" ADD CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userTwoFactorId_fkey" FOREIGN KEY ("userTwoFactorId") REFERENCES "UserTwoFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailPreference" ADD CONSTRAINT "EmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSortPreference" ADD CONSTRAINT "UserSortPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowNotification" ADD CONSTRAINT "FollowNotification_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowNotification" ADD CONSTRAINT "FollowNotification_followId_fkey" FOREIGN KEY ("followId") REFERENCES "Follow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowNotification" ADD CONSTRAINT "FollowNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_governingBodyId_fkey" FOREIGN KEY ("governingBodyId") REFERENCES "GoverningBody"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryGuide" ADD CONSTRAINT "PlantHusbandryGuide_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryGuide" ADD CONSTRAINT "PlantHusbandryGuide_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryGuide" ADD CONSTRAINT "PlantHusbandryGuide_sourcePlantDefinitionId_fkey" FOREIGN KEY ("sourcePlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAlias" ADD CONSTRAINT "PlantAlias_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAlias" ADD CONSTRAINT "PlantAlias_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantInstance" ADD CONSTRAINT "PlantInstance_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantInstance" ADD CONSTRAINT "PlantInstance_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryOverride" ADD CONSTRAINT "PlantHusbandryOverride_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryOverride" ADD CONSTRAINT "PlantHusbandryOverride_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareEvent" ADD CONSTRAINT "PlantCareEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareEvent" ADD CONSTRAINT "PlantCareEvent_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareEvent" ADD CONSTRAINT "PlantCareEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCondition" ADD CONSTRAINT "PlantCondition_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCondition" ADD CONSTRAINT "PlantCondition_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCondition" ADD CONSTRAINT "PlantCondition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareAdjustment" ADD CONSTRAINT "PlantCareAdjustment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareAdjustment" ADD CONSTRAINT "PlantCareAdjustment_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareAdjustment" ADD CONSTRAINT "PlantCareAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheet" ADD CONSTRAINT "CareSheet_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheet" ADD CONSTRAINT "CareSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetPlant" ADD CONSTRAINT "CareSheetPlant_careSheetId_fkey" FOREIGN KEY ("careSheetId") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetPlant" ADD CONSTRAINT "CareSheetPlant_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetPlant" ADD CONSTRAINT "CareSheetPlant_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetTask" ADD CONSTRAINT "CareSheetTask_careSheetId_fkey" FOREIGN KEY ("careSheetId") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetTask" ADD CONSTRAINT "CareSheetTask_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetTask" ADD CONSTRAINT "CareSheetTask_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetTask" ADD CONSTRAINT "CareSheetTask_sourceReminderId_fkey" FOREIGN KEY ("sourceReminderId") REFERENCES "Reminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetTask" ADD CONSTRAINT "CareSheetTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetAccessLog" ADD CONSTRAINT "CareSheetAccessLog_careSheetId_fkey" FOREIGN KEY ("careSheetId") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheetAccessLog" ADD CONSTRAINT "CareSheetAccessLog_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropagationEvent" ADD CONSTRAINT "PropagationEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentageLink" ADD CONSTRAINT "ParentageLink_propagationEventId_fkey" FOREIGN KEY ("propagationEventId") REFERENCES "PropagationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentageLink" ADD CONSTRAINT "ParentageLink_parentPlantInstanceId_fkey" FOREIGN KEY ("parentPlantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropagationChild" ADD CONSTRAINT "PropagationChild_propagationEventId_fkey" FOREIGN KEY ("propagationEventId") REFERENCES "PropagationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropagationChild" ADD CONSTRAINT "PropagationChild_childPlantInstanceId_fkey" FOREIGN KEY ("childPlantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloomEvent" ADD CONSTRAINT "BloomEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloomEvent" ADD CONSTRAINT "BloomEvent_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportStabilityRecord" ADD CONSTRAINT "SportStabilityRecord_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportStabilityRecord" ADD CONSTRAINT "SportStabilityRecord_propagationEventId_fkey" FOREIGN KEY ("propagationEventId") REFERENCES "PropagationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

