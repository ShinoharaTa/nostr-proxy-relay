-- Add limitation_max_limit and negentropy fields to relay_info table
ALTER TABLE relay_info ADD COLUMN limitation_max_limit INTEGER;
ALTER TABLE relay_info ADD COLUMN negentropy INTEGER DEFAULT 0;  -- 0 = not supported, 1 = supported
