ALTER TYPE "UserRole" ADD VALUE 'LANDLORD';

ALTER TABLE "properties"
ADD COLUMN "owner_id" TEXT;

ALTER TABLE "tenants"
ADD COLUMN "created_by_id" TEXT;

CREATE INDEX "properties_owner_id_idx" ON "properties"("owner_id");
CREATE INDEX "tenants_created_by_id_idx" ON "tenants"("created_by_id");

ALTER TABLE "properties"
ADD CONSTRAINT "properties_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenants"
ADD CONSTRAINT "tenants_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
