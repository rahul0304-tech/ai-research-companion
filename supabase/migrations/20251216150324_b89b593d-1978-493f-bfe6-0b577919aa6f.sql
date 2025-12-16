-- Create admin role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy for user_roles: admins can see all, users can see their own
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- Drop all existing policies on subscriptions (if any remain)
DROP POLICY IF EXISTS "Allow public delete subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public read access to subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Allow public update subscriptions" ON public.subscriptions;

-- Admin-only policies for subscriptions
CREATE POLICY "Admins can view subscriptions"
ON public.subscriptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert subscriptions"
ON public.subscriptions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscriptions"
ON public.subscriptions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscriptions"
ON public.subscriptions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing policies on whatsapp_messages
DROP POLICY IF EXISTS "Allow public insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow public read access to messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow public update messages" ON public.whatsapp_messages;

-- Admin-only policies for whatsapp_messages
CREATE POLICY "Admins can view messages"
ON public.whatsapp_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert messages"
ON public.whatsapp_messages FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update messages"
ON public.whatsapp_messages FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing policies on assistant_settings
DROP POLICY IF EXISTS "Allow public insert assistant_settings" ON public.assistant_settings;
DROP POLICY IF EXISTS "Allow public read access to assistant_settings" ON public.assistant_settings;
DROP POLICY IF EXISTS "Allow public update assistant_settings" ON public.assistant_settings;

-- Admin-only policies for assistant_settings
CREATE POLICY "Admins can view settings"
ON public.assistant_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settings"
ON public.assistant_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settings"
ON public.assistant_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing policies on ai_updates
DROP POLICY IF EXISTS "Allow public delete ai_updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Allow public insert ai_updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Allow public read access to ai_updates" ON public.ai_updates;
DROP POLICY IF EXISTS "Allow public update ai_updates" ON public.ai_updates;

-- Admin-only policies for ai_updates
CREATE POLICY "Admins can view updates"
ON public.ai_updates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert updates"
ON public.ai_updates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update updates"
ON public.ai_updates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete updates"
ON public.ai_updates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));