-- Drop all existing public policies on subscriptions table
DROP POLICY IF EXISTS "Allow public delete subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public read access to subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public update subscriptions" ON public.subscriptions;

-- RLS remains enabled, but with no policies = only service role can access
-- This secures the phone numbers from public exposure