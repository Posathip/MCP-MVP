-- CreateTable
CREATE TABLE "admin" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_server" (
    "resource_server_id" SERIAL NOT NULL,
    "domain_name" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_server_pkey" PRIMARY KEY ("resource_server_id")
);

-- CreateTable
CREATE TABLE "container_detail" (
    "container_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "internal_port" INTEGER NOT NULL,
    "resource_server_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_detail_pkey" PRIMARY KEY ("container_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_username_key" ON "admin"("username");

-- AddForeignKey
ALTER TABLE "container_detail" ADD CONSTRAINT "container_detail_resource_server_id_fkey" FOREIGN KEY ("resource_server_id") REFERENCES "resource_server"("resource_server_id") ON DELETE RESTRICT ON UPDATE CASCADE;
