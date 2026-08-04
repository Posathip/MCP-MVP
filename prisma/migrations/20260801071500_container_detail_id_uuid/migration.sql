-- Switch container_detail.id from a sequential integer to a real uuid, same reasoning as
-- Admin.uuid: a sequential 1, 2, 3... primary key shouldn't be exposed as "the" record id.
ALTER TABLE "container_detail" DROP CONSTRAINT "container_detail_pkey";
ALTER TABLE "container_detail" DROP COLUMN "id";

ALTER TABLE "container_detail" ADD COLUMN "id" TEXT;
UPDATE "container_detail" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "container_detail" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "container_detail" ADD CONSTRAINT "container_detail_pkey" PRIMARY KEY ("id");
