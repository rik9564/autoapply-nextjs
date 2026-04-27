-- Add metadata column to email_queue for storing attachments and other data
ALTER TABLE email_queue 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_email_queue_metadata ON email_queue USING GIN (metadata) WHERE metadata IS NOT NULL;

COMMENT ON COLUMN email_queue.metadata IS 'JSON metadata for attachments (base64), custom data, etc.';
