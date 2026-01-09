-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can delete updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Admins can insert updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Admins can update updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Admins can view updates" ON public.ai_updates;

-- Create new permissive policies for all authenticated users
CREATE POLICY "Authenticated users can view updates" 
ON public.ai_updates 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert updates" 
ON public.ai_updates 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update updates" 
ON public.ai_updates 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete updates" 
ON public.ai_updates 
FOR DELETE 
TO authenticated
USING (true);