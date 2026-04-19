-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('INTAKE', 'SPECCING', 'STACK_PLANNING', 'SCAFFOLDING', 'BUILDING', 'QA', 'READY', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "GateKind" AS ENUM ('SPECS', 'STACK_PLAN', 'DATA_MODEL', 'SCAFFOLD', 'FEATURE_PR', 'RED_TEAM_REVIEW', 'STUCK_DIAGNOSTIC', 'QA_SIGNOFF', 'RELEASE');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PENDING', 'DECIDED');

-- CreateEnum
CREATE TYPE "GateDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('PM', 'TECH_LEAD', 'DEV_WEB', 'DEV_MOBILE', 'DEV_BACKEND', 'DB_EXPERT', 'QA', 'RED_TEAM_QA', 'DEBUG', 'INTAKE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('IN_PROGRESS', 'READY_TO_FINALIZE', 'FINALIZED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "IntakeRole" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "githubOwner" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "installationId" BIGINT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "figmaUrl" TEXT,
    "stackPlan" JSONB,
    "status" "ProjectStatus" NOT NULL DEFAULT 'INTAKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "GateKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "status" "GateStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "GateDecision",
    "feedback" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "TicketStatus" NOT NULL DEFAULT 'TODO',
    "dependsOn" TEXT[],
    "prNumber" INTEGER,
    "branch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ticketId" TEXT,
    "role" "AgentRole" NOT NULL,
    "task" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "transcript" JSONB,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSession" (
    "id" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "name" TEXT,
    "githubOwner" TEXT,
    "githubRepo" TEXT,
    "installationId" BIGINT,
    "figmaUrl" TEXT,
    "coverage" JSONB,
    "finalBrief" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "IntakeRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "openedByRole" "AgentRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_githubOwner_githubRepo_key" ON "Project"("githubOwner", "githubRepo");

-- CreateIndex
CREATE INDEX "Gate_projectId_status_idx" ON "Gate"("projectId", "status");

-- CreateIndex
CREATE INDEX "Ticket_projectId_status_idx" ON "Ticket"("projectId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_role_status_idx" ON "AgentRun"("projectId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSession_projectId_key" ON "IntakeSession"("projectId");

-- CreateIndex
CREATE INDEX "IntakeSession_status_idx" ON "IntakeSession"("status");

-- CreateIndex
CREATE INDEX "IntakeMessage_sessionId_createdAt_idx" ON "IntakeMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_projectId_number_key" ON "PullRequest"("projectId", "number");

-- AddForeignKey
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeMessage" ADD CONSTRAINT "IntakeMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

