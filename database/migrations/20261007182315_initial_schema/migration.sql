-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TENANT');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'PAUSED', 'UNDER_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "RoomCondition" AS ENUM ('READY', 'MAINTENANCE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('RESIDENT', 'FORMER');

-- CreateEnum
CREATE TYPE "TenantRegistrationStatus" AS ENUM ('REGISTERED', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('PENDING_SIGNATURE', 'ACTIVE', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceLineType" AS ENUM ('RENT', 'ELECTRICITY', 'WATER', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('ELECTRICITY', 'WATER');

-- CreateEnum
CREATE TYPE "AmenityBookingStatus" AS ENUM ('PENDING', 'APPROVED', 'USED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoomViewingStatus" AS ENUM ('PENDING', 'CONTACTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceRequestSource" AS ENUM ('TENANT_PORTAL', 'ADMIN', 'PUBLIC');

-- CreateEnum
CREATE TYPE "MaintenanceRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_name" VARCHAR(200),
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "address" VARCHAR(500),
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "province" VARCHAR(120) NOT NULL,
    "room_prefix" VARCHAR(20) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "manager_name" VARCHAR(200),
    "default_rent_vnd" INTEGER NOT NULL,
    "default_area_m2" DECIMAL(8,2),
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_number" VARCHAR(30) NOT NULL,
    "floor" INTEGER NOT NULL,
    "area_m2" DECIMAL(8,2),
    "rent_override_vnd" INTEGER,
    "condition" "RoomCondition" NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "national_id" VARCHAR(12) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "status" "TenantStatus" NOT NULL DEFAULT 'RESIDENT',
    "registration_status" "TenantRegistrationStatus" NOT NULL DEFAULT 'UNREGISTERED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vehicle_type" VARCHAR(80) NOT NULL,
    "plate_number" VARCHAR(30),
    "parking_slot" VARCHAR(50),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_contracts" (
    "id" TEXT NOT NULL,
    "contract_number" VARCHAR(50) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "monthly_rent_vnd" INTEGER NOT NULL,
    "deposit_vnd" INTEGER NOT NULL,
    "occupant_count" INTEGER NOT NULL DEFAULT 1,
    "start_electric_meter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "start_water_meter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "latest_electric_meter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "latest_water_meter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "signed_at" TIMESTAMP(3),
    "document_storage_key" VARCHAR(1000),
    "document_file_name" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_occupants" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "full_name" VARCHAR(200) NOT NULL,
    "national_id" VARCHAR(12),
    "phone" VARCHAR(30),
    "relationship" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_occupants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_extensions" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "previous_end_date" DATE NOT NULL,
    "new_end_date" DATE NOT NULL,
    "previous_rent_vnd" INTEGER,
    "new_rent_vnd" INTEGER,
    "previous_deposit_vnd" INTEGER,
    "new_deposit_vnd" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_terminations" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "terminated_on" DATE NOT NULL,
    "reason" TEXT,
    "final_electric_meter" DECIMAL(12,3) NOT NULL,
    "final_water_meter" DECIMAL(12,3) NOT NULL,
    "deposit_deduction_vnd" INTEGER NOT NULL DEFAULT 0,
    "deposit_refund_vnd" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_terminations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "contract_id" TEXT NOT NULL,
    "billing_year" INTEGER NOT NULL,
    "billing_month" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "total_vnd" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "type" "InvoiceLineType" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(40),
    "unit_price_vnd" INTEGER NOT NULL,
    "amount_vnd" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "type" "MeterType" NOT NULL,
    "previous_value" DECIMAL(12,3) NOT NULL,
    "current_value" DECIMAL(12,3) NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,
    "amount_vnd" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_vnd" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
    "reference" VARCHAR(200),
    "note" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "property_id" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "location" VARCHAR(160) NOT NULL,
    "price_vnd" INTEGER NOT NULL DEFAULT 0,
    "price_unit" VARCHAR(40) NOT NULL,
    "opens_at" VARCHAR(5),
    "closes_at" VARCHAR(5),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenity_bookings" (
    "id" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "room_id" TEXT,
    "use_date" DATE NOT NULL,
    "time_slot" VARCHAR(80) NOT NULL,
    "note" TEXT,
    "status" "AmenityBookingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amenity_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_viewing_requests" (
    "id" TEXT NOT NULL,
    "room_id" TEXT,
    "visitor_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(254),
    "preferred_date" DATE,
    "preferred_time" VARCHAR(40),
    "note" TEXT,
    "status" "RoomViewingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_viewing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "room_id" TEXT,
    "source" "MaintenanceRequestSource" NOT NULL DEFAULT 'TENANT_PORTAL',
    "category" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "invoice" BOOLEAN NOT NULL DEFAULT true,
    "overdue" BOOLEAN NOT NULL DEFAULT true,
    "contract" BOOLEAN NOT NULL DEFAULT false,
    "issue" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_username_key" ON "user_accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_phone_key" ON "user_accounts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_tenant_id_key" ON "user_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE INDEX "properties_province_status_idx" ON "properties"("province", "status");

-- CreateIndex
CREATE INDEX "rooms_property_id_condition_idx" ON "rooms"("property_id", "condition");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_room_number_key" ON "rooms"("property_id", "room_number");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_national_id_key" ON "tenants"("national_id");

-- CreateIndex
CREATE INDEX "tenants_full_name_idx" ON "tenants"("full_name");

-- CreateIndex
CREATE INDEX "tenants_status_registration_status_idx" ON "tenants"("status", "registration_status");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_idx" ON "vehicles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_contracts_contract_number_key" ON "lease_contracts"("contract_number");

-- CreateIndex
CREATE INDEX "lease_contracts_tenant_id_status_idx" ON "lease_contracts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "lease_contracts_room_id_status_start_date_end_date_idx" ON "lease_contracts"("room_id", "status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "contract_occupants_contract_id_idx" ON "contract_occupants"("contract_id");

-- CreateIndex
CREATE INDEX "contract_occupants_tenant_id_idx" ON "contract_occupants"("tenant_id");

-- CreateIndex
CREATE INDEX "contract_extensions_contract_id_created_at_idx" ON "contract_extensions"("contract_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contract_terminations_contract_id_key" ON "contract_terminations"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_contract_id_billing_year_billing_month_key" ON "invoices"("contract_id", "billing_year", "billing_month");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_invoice_id_type_key" ON "meter_readings"("invoice_id", "type");

-- CreateIndex
CREATE INDEX "payments_invoice_id_received_at_idx" ON "payments"("invoice_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_code_key" ON "amenities"("code");

-- CreateIndex
CREATE INDEX "amenities_property_id_is_active_idx" ON "amenities"("property_id", "is_active");

-- CreateIndex
CREATE INDEX "amenity_bookings_amenity_id_use_date_status_idx" ON "amenity_bookings"("amenity_id", "use_date", "status");

-- CreateIndex
CREATE INDEX "amenity_bookings_tenant_id_created_at_idx" ON "amenity_bookings"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "room_viewing_requests_status_created_at_idx" ON "room_viewing_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "room_viewing_requests_phone_idx" ON "room_viewing_requests"("phone");

-- CreateIndex
CREATE INDEX "maintenance_requests_status_priority_created_at_idx" ON "maintenance_requests"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "maintenance_requests_tenant_id_created_at_idx" ON "maintenance_requests"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_account_id_key" ON "notification_preferences"("account_id");

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_contracts" ADD CONSTRAINT "lease_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_contracts" ADD CONSTRAINT "lease_contracts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_occupants" ADD CONSTRAINT "contract_occupants_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "lease_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_occupants" ADD CONSTRAINT "contract_occupants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_extensions" ADD CONSTRAINT "contract_extensions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "lease_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terminations" ADD CONSTRAINT "contract_terminations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "lease_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "lease_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenity_bookings" ADD CONSTRAINT "amenity_bookings_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenity_bookings" ADD CONSTRAINT "amenity_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenity_bookings" ADD CONSTRAINT "amenity_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_viewing_requests" ADD CONSTRAINT "room_viewing_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants not expressible in the Prisma schema DSL.
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_default_rent_nonnegative" CHECK ("default_rent_vnd" >= 0),
  ADD CONSTRAINT "properties_default_area_positive" CHECK ("default_area_m2" IS NULL OR "default_area_m2" > 0);

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_floor_positive" CHECK ("floor" > 0),
  ADD CONSTRAINT "rooms_area_positive" CHECK ("area_m2" IS NULL OR "area_m2" > 0),
  ADD CONSTRAINT "rooms_rent_nonnegative" CHECK ("rent_override_vnd" IS NULL OR "rent_override_vnd" >= 0);

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_national_id_12_digits" CHECK ("national_id" ~ '^[0-9]{12}$');

ALTER TABLE "lease_contracts"
  ADD CONSTRAINT "lease_contracts_dates_ordered" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "lease_contracts_rent_nonnegative" CHECK ("monthly_rent_vnd" >= 0),
  ADD CONSTRAINT "lease_contracts_deposit_nonnegative" CHECK ("deposit_vnd" >= 0),
  ADD CONSTRAINT "lease_contracts_occupants_positive" CHECK ("occupant_count" > 0),
  ADD CONSTRAINT "lease_contracts_meters_nonnegative" CHECK (
    "start_electric_meter" >= 0 AND "start_water_meter" >= 0 AND
    "latest_electric_meter" >= 0 AND "latest_water_meter" >= 0
  );

ALTER TABLE "contract_terminations"
  ADD CONSTRAINT "contract_terminations_amounts_nonnegative" CHECK (
    "deposit_deduction_vnd" >= 0 AND "deposit_refund_vnd" >= 0
  ),
  ADD CONSTRAINT "contract_terminations_meters_nonnegative" CHECK (
    "final_electric_meter" >= 0 AND "final_water_meter" >= 0
  );

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_billing_month_valid" CHECK ("billing_month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "invoices_total_nonnegative" CHECK ("total_vnd" >= 0);

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_amounts_nonnegative" CHECK (
    "quantity" >= 0 AND "unit_price_vnd" >= 0 AND "amount_vnd" >= 0
  );

ALTER TABLE "meter_readings"
  ADD CONSTRAINT "meter_readings_values_valid" CHECK (
    "previous_value" >= 0 AND "current_value" >= "previous_value" AND
    "unit_price_vnd" >= 0 AND "amount_vnd" >= 0
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_vnd" > 0);

ALTER TABLE "amenities"
  ADD CONSTRAINT "amenities_price_nonnegative" CHECK ("price_vnd" >= 0),
  ADD CONSTRAINT "amenities_capacity_nonnegative" CHECK ("capacity" IS NULL OR "capacity" >= 0);

-- A pending signature reserves the room just like an active lease.
CREATE UNIQUE INDEX "lease_contracts_one_open_contract_per_room_key"
  ON "lease_contracts"("room_id")
  WHERE "status" IN ('PENDING_SIGNATURE', 'ACTIVE');

CREATE UNIQUE INDEX "lease_contracts_one_open_contract_per_tenant_key"
  ON "lease_contracts"("tenant_id")
  WHERE "status" IN ('PENDING_SIGNATURE', 'ACTIVE');
