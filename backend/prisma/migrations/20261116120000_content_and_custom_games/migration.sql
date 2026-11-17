-- Content tables (topics, entities, stats with their sources, missions), custom mode (player-made games with
-- ratings and reports), and indexes the existing tables were missing. Additive only: nothing is dropped or rewritten.
-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "licence" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatDef" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "best" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "StatDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "statFamily" TEXT NOT NULL,
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "universe" TEXT NOT NULL DEFAULT '',
    "archetype" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "facts" JSONB,
    "imageQuery" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityStat" (
    "entityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "measured" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityStat_pkey" PRIMARY KEY ("entityId","key")
);

-- CreateTable
CREATE TABLE "EntityStatVote" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityStatVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL DEFAULT '',
    "weights" JSONB NOT NULL,
    "wantTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomGame" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "plays" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "dislikes" INTEGER NOT NULL DEFAULT 0,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "CustomGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomGameRating" (
    "gameId" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomGameRating_pkey" PRIMARY KEY ("gameId","voter")
);

-- CreateTable
CREATE TABLE "CustomGameReport" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "reporter" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomGameReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatDef_family_key_key" ON "StatDef"("family", "key");

-- CreateIndex
CREATE INDEX "Entity_topicId_active_idx" ON "Entity"("topicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_topicId_slug_key" ON "Entity"("topicId", "slug");

-- CreateIndex
CREATE INDEX "EntityStatVote_entityId_key_idx" ON "EntityStatVote"("entityId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EntityStatVote_entityId_key_voter_key" ON "EntityStatVote"("entityId", "key", "voter");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_family_slug_key" ON "Mission"("family", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CustomGame_slug_key" ON "CustomGame"("slug");

-- CreateIndex
CREATE INDEX "CustomGame_status_visibility_plays_idx" ON "CustomGame"("status", "visibility", "plays");

-- CreateIndex
CREATE INDEX "CustomGame_status_visibility_publishedAt_idx" ON "CustomGame"("status", "visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "CustomGame_authorId_updatedAt_idx" ON "CustomGame"("authorId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomGameReport_gameId_reporter_key" ON "CustomGameReport"("gameId", "reporter");

-- CreateIndex
CREATE INDEX "Room_hostId_idx" ON "Room"("hostId");

-- CreateIndex
CREATE INDEX "Room_isPublic_status_idx" ON "Room"("isPublic", "status");

-- CreateIndex
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");

-- CreateIndex
CREATE INDEX "NBAPlayer_name_idx" ON "NBAPlayer"("name");

-- CreateIndex
CREATE INDEX "NFLPlayer_name_idx" ON "NFLPlayer"("name");

-- CreateIndex
CREATE INDEX "NFLPlayer_normalizedPos_idx" ON "NFLPlayer"("normalizedPos");

-- CreateIndex
CREATE INDEX "NFLPlayerSeasonStat_season_idx" ON "NFLPlayerSeasonStat"("season");

-- CreateIndex
CREATE INDEX "Draft_ownerId_createdAt_idx" ON "Draft"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Draft_gameId_idx" ON "Draft"("gameId");

-- CreateIndex
CREATE INDEX "DraftStyle_ownerId_idx" ON "DraftStyle"("ownerId");

-- CreateIndex
CREATE INDEX "DraftStyle_visibility_plays_idx" ON "DraftStyle"("visibility", "plays");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- AddForeignKey
ALTER TABLE "StatDef" ADD CONSTRAINT "StatDef_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityStat" ADD CONSTRAINT "EntityStat_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityStat" ADD CONSTRAINT "EntityStat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityStatVote" ADD CONSTRAINT "EntityStatVote_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomGame" ADD CONSTRAINT "CustomGame_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomGameRating" ADD CONSTRAINT "CustomGameRating_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CustomGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomGameReport" ADD CONSTRAINT "CustomGameReport_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CustomGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

