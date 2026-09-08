-- Treat tyre serials as case-insensitive for uniqueness.
-- Fail clearly if existing rows already collide only by case.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tyres
    GROUP BY lower(serial_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add tyres_serial_lower_unique: serials differ only by case';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tyres_serial_lower_unique
  ON tyres (lower(serial_number));
