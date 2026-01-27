
# Secure the Send-Scheduled Function

## Overview
Add CRON_SECRET authentication to the `send-scheduled` edge function to prevent unauthorized access. This ensures only the authorized cron job can trigger scheduled message processing.

## Changes Required

### 1. Add the CRON_SECRET to Project Secrets
I'll use the secrets tool to prompt you to enter your CRON_SECRET value. This will securely store it in the project's backend.

### 2. Update the Edge Function
Modify `supabase/functions/send-scheduled/index.ts` to:
- Read the `CRON_SECRET` from environment variables
- Validate the incoming request's `Authorization` header against the secret
- Return `401 Unauthorized` if the secret doesn't match

The function will check for the header format:
```
Authorization: Bearer YOUR_CRON_SECRET
```

### 3. Update the Cron Job Configuration
After securing the function, you'll need to update the existing cron job SQL to include the CRON_SECRET in the Authorization header when calling the function.

---

## Technical Details

**Edge Function Security Check (new code at the start of the request handler):**
```text
// After OPTIONS check, before any processing:
const cronSecret = Deno.env.get('CRON_SECRET');
const authHeader = req.headers.get('Authorization');

if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

**Updated Cron Job SQL (to be run after adding the secret):**
```text
-- First, delete the existing cron job
SELECT cron.unschedule('send-scheduled-messages');

-- Then create new job with CRON_SECRET
SELECT cron.schedule(
  'send-scheduled-messages',
  '0 * * * *', -- every hour
  $$
  SELECT net.http_post(
    url:='https://bdhluxayukdzelsbvtqf.supabase.co/functions/v1/send-scheduled',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body:='{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);
```

## Execution Steps
1. Add the CRON_SECRET to your project secrets (I'll prompt you for this)
2. Update the edge function with authentication logic
3. Update the cron job to pass the secret in the Authorization header

This will close the OPEN_ENDPOINTS security issue by ensuring only authenticated requests can trigger the scheduled message processor.
