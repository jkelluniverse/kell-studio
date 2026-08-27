-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'PAST');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT';

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "visibleToClient" BOOLEAN NOT NULL DEFAULT true;
