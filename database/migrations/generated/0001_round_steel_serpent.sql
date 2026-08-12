ALTER TABLE "parts" ADD COLUMN "barcode" text;--> statement-breakpoint
CREATE UNIQUE INDEX "parts_barcode_unique" ON "parts" USING btree ("barcode");