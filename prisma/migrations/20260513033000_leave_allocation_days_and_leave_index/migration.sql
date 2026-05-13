-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN "leaveAllocationDays" INTEGER NOT NULL DEFAULT 20;

-- CreateIndex
CREATE INDEX "Leave_userId_status_idx" ON "Leave"("userId", "status");
