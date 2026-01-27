-- Fix ai_updates RLS policies: revert from any-authenticated to admin-only
-- This addresses the PUBLIC_DATA_EXPOSURE security issue

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Authenticated users can update updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Authenticated users can delete updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Authenticated users can view updates" ON public.ai_updates;

-- Create admin-only policies
CREATE POLICY "Admins can insert updates" 
ON public.ai_updates FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update updates" 
ON public.ai_updates FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete updates" 
ON public.ai_updates FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Keep viewing accessible to any authenticated user (they may need to see updates)
CREATE POLICY "Authenticated users can view updates" 
ON public.ai_updates FOR SELECT TO authenticated
USING (true);