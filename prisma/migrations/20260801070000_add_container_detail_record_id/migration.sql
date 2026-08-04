-- Add a surrogate auto-increment "id" as the real primary key (matching the other tables'
-- convention), and demote container_name to a plain unique key instead of the primary key.
ALTER TABLE "container_detail" ADD COLUMN "id" SERIAL;

ALTER TABLE "container_detail" DROP CONSTRAINT "container_detail_pkey";
ALTER TABLE "container_detail" ADD CONSTRAINT "container_detail_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "container_detail_container_name_key" ON "container_detail"("container_name");
