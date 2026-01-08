-- Add recurrence fields to scheduled_messages
ALTER TABLE public.scheduled_messages 
ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'once',
ADD COLUMN IF NOT EXISTS recurrence_interval integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_end_date timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_run_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS prompt_instructions text DEFAULT NULL;

-- Enable realtime for scheduled_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;