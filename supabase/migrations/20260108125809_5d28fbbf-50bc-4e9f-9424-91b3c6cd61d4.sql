-- Enable the pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable the pg_cron extension for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create the cron job to run every minute
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bdhluxayukdzelsbvtqf.supabase.co/functions/v1/send-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaGx1eGF5dWtkemVsc2J2dHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MTM1OTEsImV4cCI6MjA3OTQ4OTU5MX0.Mco5kNV_e5PtnBaOeHm0Xxquc5aC6L-qkq7qPLogOM0'
    ),
    body := '{}'::jsonb
  );
  $$
);