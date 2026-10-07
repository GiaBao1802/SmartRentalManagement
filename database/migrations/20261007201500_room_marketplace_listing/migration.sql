ALTER TABLE "rooms"
ADD COLUMN "is_listed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "rooms_is_listed_condition_idx" ON "rooms"("is_listed", "condition");
