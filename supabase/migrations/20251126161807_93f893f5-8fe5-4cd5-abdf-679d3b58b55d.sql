-- Add model_used column to track which AI model was used for each response
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS model_used TEXT;