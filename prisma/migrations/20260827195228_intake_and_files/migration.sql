-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('JACOB', 'CLIENT_INTAKE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "IntakeItemKind" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'CHOICE', 'FILE_REQUEST');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "intakeItemId" TEXT,
ADD COLUMN     "intakeResponseId" TEXT,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "source" "DocumentSource" NOT NULL DEFAULT 'JACOB';

-- CreateTable
CREATE TABLE "IntakeForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "token" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "IntakeForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "IntakeItemKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "choices" TEXT[],

    CONSTRAINT "IntakeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "respondentName" TEXT,
    "respondentEmail" TEXT,

    CONSTRAINT "IntakeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "responseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueBool" BOOLEAN,
    "valueChoice" TEXT,

    CONSTRAINT "IntakeAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntakeForm_token_key" ON "IntakeForm"("token");

-- CreateIndex
CREATE INDEX "IntakeForm_tenantId_idx" ON "IntakeForm"("tenantId");

-- CreateIndex
CREATE INDEX "IntakeItem_tenantId_idx" ON "IntakeItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeItem_formId_order_key" ON "IntakeItem"("formId", "order");

-- CreateIndex
CREATE INDEX "IntakeResponse_tenantId_idx" ON "IntakeResponse"("tenantId");

-- CreateIndex
CREATE INDEX "IntakeAnswer_tenantId_idx" ON "IntakeAnswer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeAnswer_responseId_itemId_key" ON "IntakeAnswer"("responseId", "itemId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_intakeResponseId_fkey" FOREIGN KEY ("intakeResponseId") REFERENCES "IntakeResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeItem" ADD CONSTRAINT "IntakeItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeItem" ADD CONSTRAINT "IntakeItem_formId_fkey" FOREIGN KEY ("formId") REFERENCES "IntakeForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeResponse" ADD CONSTRAINT "IntakeResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeResponse" ADD CONSTRAINT "IntakeResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "IntakeForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAnswer" ADD CONSTRAINT "IntakeAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAnswer" ADD CONSTRAINT "IntakeAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "IntakeResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAnswer" ADD CONSTRAINT "IntakeAnswer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "IntakeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
