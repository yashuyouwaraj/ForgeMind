-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "repository";

-- CreateEnum
CREATE TYPE "repository"."RepositoryProvider" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'AZURE_DEVOPS', 'LOCAL_REPOSITORY', 'ZIP_ARCHIVE');

-- CreateTable
CREATE TABLE "repository"."repositories" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "repository"."RepositoryProvider" NOT NULL,
    "defaultBranch" TEXT,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repositories_projectId_idx" ON "repository"."repositories"("projectId");

-- CreateIndex
CREATE INDEX "repositories_status_idx" ON "repository"."repositories"("status");
