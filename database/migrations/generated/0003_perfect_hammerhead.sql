CREATE TYPE "public"."job_card_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."tyre_asset_status" AS ENUM('IN_STORE', 'FITTED', 'AT_DAG', 'SCRAPPED');--> statement-breakpoint
CREATE TYPE "public"."tyre_event_type" AS ENUM('REGISTER', 'FIT', 'REMOVE', 'REPLACE', 'SEND_DAG', 'RECEIVE_DAG', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."tyre_lifecycle_stage" AS ENUM('ORG', 'DAG1', 'DAG2', 'DAG3', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."tyre_position" AS ENUM('FL', 'FR', 'RLI', 'RLO', 'RRI', 'RRO', 'SPARE');--> statement-breakpoint
ALTER TYPE "public"."stock_document_type" ADD VALUE 'TYRE_DAG_SEND';--> statement-breakpoint
ALTER TYPE "public"."stock_document_type" ADD VALUE 'TYRE_DAG_RECEIVE';--> statement-breakpoint
CREATE TABLE "job_card_sequences" (
	"store_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_number" text NOT NULL,
	"store_id" uuid NOT NULL,
	"bus_id" uuid NOT NULL,
	"status" "job_card_status" DEFAULT 'OPEN' NOT NULL,
	"business_date" text NOT NULL,
	"odometer_km" numeric(14, 1),
	"complaint" text NOT NULL,
	"work_done" text,
	"mechanic_name" text,
	"notes" text,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oil_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_card_id" uuid NOT NULL,
	"bus_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"stock_document_id" uuid,
	"litres" numeric(14, 3) NOT NULL,
	"odometer_km" numeric(14, 1),
	"business_date" text NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oil_changes_litres_positive" CHECK ("oil_changes"."litres" > 0)
);
--> statement-breakpoint
CREATE TABLE "tyre_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tyre_id" uuid NOT NULL,
	"type" "tyre_event_type" NOT NULL,
	"job_card_id" uuid,
	"stock_document_id" uuid,
	"store_id" uuid,
	"bus_id" uuid,
	"from_position" "tyre_position",
	"to_position" "tyre_position",
	"from_stage" "tyre_lifecycle_stage",
	"to_stage" "tyre_lifecycle_stage",
	"odometer_km" numeric(14, 1),
	"notes" text,
	"created_by" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tyres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"part_id" uuid NOT NULL,
	"lifecycle_stage" "tyre_lifecycle_stage" DEFAULT 'ORG' NOT NULL,
	"status" "tyre_asset_status" DEFAULT 'IN_STORE' NOT NULL,
	"store_id" uuid,
	"current_bus_id" uuid,
	"current_position" "tyre_position",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tyres_fitted_has_position" CHECK (("tyres"."status" = 'FITTED' AND "tyres"."current_bus_id" IS NOT NULL AND "tyres"."current_position" IS NOT NULL)
        OR ("tyres"."status" <> 'FITTED' AND "tyres"."current_bus_id" IS NULL AND "tyres"."current_position" IS NULL)),
	CONSTRAINT "tyres_in_store_has_store" CHECK ("tyres"."status" <> 'IN_STORE' OR "tyres"."store_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD COLUMN "job_card_id" uuid;--> statement-breakpoint
ALTER TABLE "job_card_sequences" ADD CONSTRAINT "job_card_sequences_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_changes" ADD CONSTRAINT "oil_changes_job_card_id_job_cards_id_fk" FOREIGN KEY ("job_card_id") REFERENCES "public"."job_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_changes" ADD CONSTRAINT "oil_changes_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_changes" ADD CONSTRAINT "oil_changes_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_changes" ADD CONSTRAINT "oil_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_events" ADD CONSTRAINT "tyre_events_tyre_id_tyres_id_fk" FOREIGN KEY ("tyre_id") REFERENCES "public"."tyres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_events" ADD CONSTRAINT "tyre_events_job_card_id_job_cards_id_fk" FOREIGN KEY ("job_card_id") REFERENCES "public"."job_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_events" ADD CONSTRAINT "tyre_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_events" ADD CONSTRAINT "tyre_events_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_events" ADD CONSTRAINT "tyre_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyres" ADD CONSTRAINT "tyres_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyres" ADD CONSTRAINT "tyres_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyres" ADD CONSTRAINT "tyres_current_bus_id_buses_id_fk" FOREIGN KEY ("current_bus_id") REFERENCES "public"."buses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_card_sequences_store_year_unique" ON "job_card_sequences" USING btree ("store_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "job_cards_number_unique" ON "job_cards" USING btree ("job_number");--> statement-breakpoint
CREATE UNIQUE INDEX "job_cards_one_open_per_bus" ON "job_cards" USING btree ("bus_id") WHERE "job_cards"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "job_cards_store_date_idx" ON "job_cards" USING btree ("store_id","business_date");--> statement-breakpoint
CREATE INDEX "job_cards_bus_idx" ON "job_cards" USING btree ("bus_id");--> statement-breakpoint
CREATE INDEX "oil_changes_bus_idx" ON "oil_changes" USING btree ("bus_id");--> statement-breakpoint
CREATE INDEX "oil_changes_job_card_idx" ON "oil_changes" USING btree ("job_card_id");--> statement-breakpoint
CREATE INDEX "tyre_events_tyre_time_idx" ON "tyre_events" USING btree ("tyre_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tyre_events_job_card_idx" ON "tyre_events" USING btree ("job_card_id");--> statement-breakpoint
CREATE INDEX "tyre_events_bus_time_idx" ON "tyre_events" USING btree ("bus_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tyres_serial_unique" ON "tyres" USING btree ("serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tyres_fitted_position_unique" ON "tyres" USING btree ("current_bus_id","current_position") WHERE "tyres"."status" = 'FITTED';--> statement-breakpoint
CREATE INDEX "tyres_store_status_idx" ON "tyres" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "tyres_bus_idx" ON "tyres" USING btree ("current_bus_id");--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_job_card_id_job_cards_id_fk" FOREIGN KEY ("job_card_id") REFERENCES "public"."job_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_documents_job_card_idx" ON "stock_documents" USING btree ("job_card_id");--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "bus_return_requires_bus" CHECK ("stock_documents"."type" <> 'BUS_RETURN' OR "stock_documents"."bus_id" IS NOT NULL);