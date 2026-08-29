-- KS-05: Capture pipeline status supersedes KS-02's transcriptStatus.
-- Old values are migrated into the new column before the old one drops:
--   NOT_APPLICABLE -> READY (text captures; extraction never ran pre-KS-05)
--   PENDING        -> TRANSCRIBING
--   DONE           -> READY (transcript present; extraction never ran)
--   FAILED         -> FAILED

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('READY', 'TRANSCRIBING', 'EXTRACTING', 'REVIEW', 'DONE', 'FAILED');

-- AlterTable: add the new columns first
ALTER TABLE "Capture"
ADD COLUMN     "failureNote" TEXT,
ADD COLUMN     "status" "CaptureStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "transcriptJobId" TEXT;

-- Migrate old values
UPDATE "Capture" SET "status" = CASE "transcriptStatus"
  WHEN 'PENDING' THEN 'TRANSCRIBING'::"CaptureStatus"
  WHEN 'FAILED'  THEN 'FAILED'::"CaptureStatus"
  ELSE 'READY'::"CaptureStatus"
END;

-- Drop the superseded column and enum
ALTER TABLE "Capture" DROP COLUMN "transcriptStatus";
DROP TYPE "TranscriptStatus";
