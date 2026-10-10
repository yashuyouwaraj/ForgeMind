-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "project";

-- CreateEnum
CREATE TYPE "project"."ProjectRole" AS ENUM ('OWNER', 'ADMINISTRATOR', 'MAINTAINER', 'DEVELOPER', 'VIEWER');

-- CreateTable
CREATE TABLE "project"."projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project"."project_memberships" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "project"."ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "projects_ownerId_idx" ON "project"."projects"("ownerId");

-- CreateIndex
CREATE INDEX "project_memberships_userId_idx" ON "project"."project_memberships"("userId");

-- AddForeignKey
ALTER TABLE "project"."project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
