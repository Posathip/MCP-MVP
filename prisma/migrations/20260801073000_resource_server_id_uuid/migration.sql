-- Same treatment as container_detail.id: resource_server gets a real uuid primary key,
-- and resource_server_id (still auto-increment) becomes a plain unique key that
-- container_detail's foreign key keeps referencing unchanged.

-- Drop the FK first so we can swap resource_server's primary key.
ALTER TABLE "container_detail" DROP CONSTRAINT "container_detail_resource_server_id_fkey";

ALTER TABLE "resource_server" ADD COLUMN "id" TEXT;
UPDATE "resource_server" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "resource_server" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "resource_server" DROP CONSTRAINT "resource_server_pkey";
ALTER TABLE "resource_server" ADD CONSTRAINT "resource_server_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "resource_server_resource_server_id_key" ON "resource_server"("resource_server_id");

-- Re-add the FK, now backed by the unique index on resource_server_id.
ALTER TABLE "container_detail" ADD CONSTRAINT "container_detail_resource_server_id_fkey"
  FOREIGN KEY ("resource_server_id") REFERENCES "resource_server"("resource_server_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
