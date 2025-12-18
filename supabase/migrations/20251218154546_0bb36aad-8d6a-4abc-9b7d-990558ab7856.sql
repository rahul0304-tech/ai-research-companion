-- Add latency metrics columns to whatsapp_messages table
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS ai_latency_ms integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_latency_ms integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT NULL;

-- Add DELETE policy for admins to allow clearing messages
CREATE POLICY "Admins can delete messages" 
ON public.whatsapp_messages 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));