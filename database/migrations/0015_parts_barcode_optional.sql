-- Normalize blank barcodes, then make uniqueness apply only when a value exists.
UPDATE parts
SET barcode = NULL
WHERE barcode IS NOT NULL AND BTRIM(barcode) = '';

DROP INDEX IF EXISTS parts_barcode_unique;

CREATE UNIQUE INDEX parts_barcode_unique
ON parts (barcode)
WHERE barcode IS NOT NULL;
