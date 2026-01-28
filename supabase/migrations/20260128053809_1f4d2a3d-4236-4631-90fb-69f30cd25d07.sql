-- Restrict ai_updates SELECT to admin-only (previously allowed any authenticated user)
DROP POLICY IF EXISTS "Authenticated users can view updates" ON public.ai_updates;

CREATE POLICY "Admins can view updates" 
ON public.ai_updates FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));