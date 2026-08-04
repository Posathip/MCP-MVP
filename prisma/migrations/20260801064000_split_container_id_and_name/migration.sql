-- The old "container_id" column actually held the human-readable name (the docker --name /
-- image tag, e.g. "owner-repo"), not Docker's real assigned container id. Rename it to
-- container_name (keeps the primary key + existing data), then add a separate nullable column
-- for the real Docker-assigned container id captured after `docker run`.
ALTER TABLE "container_detail" RENAME COLUMN "container_id" TO "container_name";
ALTER TABLE "container_detail" ADD COLUMN "docker_container_id" TEXT;
