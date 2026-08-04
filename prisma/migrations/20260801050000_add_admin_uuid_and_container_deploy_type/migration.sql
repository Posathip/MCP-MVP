-- Add uuid as nullable first so it can be backfilled on existing rows
ALTER TABLE "admin" ADD COLUMN "uuid" TEXT;

-- Backfill existing rows with a real random uuid
UPDATE "admin" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;

-- Now enforce NOT NULL + uniqueness
ALTER TABLE "admin" ALTER COLUMN "uuid" SET NOT NULL;
CREATE UNIQUE INDEX "admin_uuid_key" ON "admin"("uuid");

-- ContainerDetail: track how it was deployed so stop/start can pick the right docker command
ALTER TABLE "container_detail" ADD COLUMN "deploy_type" TEXT NOT NULL DEFAULT 'dockerfile';
ALTER TABLE "container_detail" ADD COLUMN "workspace_dir" TEXT;
