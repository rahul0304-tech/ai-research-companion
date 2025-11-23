-- Create whatsapp_messages table
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
  message_type TEXT NOT NULL DEFAULT 'text',
  message_content TEXT NOT NULL,
  message_id TEXT,
  ai_response TEXT,
  tool_calls JSONB,
  intent TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ai_updates table
CREATE TABLE public.ai_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_content TEXT,
  sources JSONB,
  category TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preferences JSONB DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create assistant_settings table
CREATE TABLE public.assistant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_whatsapp_messages_phone_number ON public.whatsapp_messages(phone_number);
CREATE INDEX idx_whatsapp_messages_received_at ON public.whatsapp_messages(received_at DESC);
CREATE INDEX idx_ai_updates_scheduled_for ON public.ai_updates(scheduled_for);
CREATE INDEX idx_ai_updates_status ON public.ai_updates(status);
CREATE INDEX idx_subscriptions_phone_number ON public.subscriptions(phone_number);
CREATE INDEX idx_subscriptions_active ON public.subscriptions(active);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access (dashboard viewing)
-- Messages: allow all reads (dashboard needs to see all messages)
CREATE POLICY "Allow public read access to messages"
  ON public.whatsapp_messages FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert messages"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update messages"
  ON public.whatsapp_messages FOR UPDATE
  USING (true);

-- AI Updates: allow all operations (dashboard management)
CREATE POLICY "Allow public read access to ai_updates"
  ON public.ai_updates FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert ai_updates"
  ON public.ai_updates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update ai_updates"
  ON public.ai_updates FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete ai_updates"
  ON public.ai_updates FOR DELETE
  USING (true);

-- Subscriptions: allow all operations
CREATE POLICY "Allow public read access to subscriptions"
  ON public.subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete subscriptions"
  ON public.subscriptions FOR DELETE
  USING (true);

-- Assistant settings: allow all operations
CREATE POLICY "Allow public read access to assistant_settings"
  ON public.assistant_settings FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert assistant_settings"
  ON public.assistant_settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update assistant_settings"
  ON public.assistant_settings FOR UPDATE
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_updates_updated_at
  BEFORE UPDATE ON public.ai_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assistant_settings_updated_at
  BEFORE UPDATE ON public.assistant_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default assistant settings
INSERT INTO public.assistant_settings (setting_key, setting_value, description) VALUES
  ('system_prompt', '{"prompt": "You are InfoNiblet, a friendly and professional AI research assistant. Keep answers clear, concise, and always include sources when making factual claims."}', 'Main system prompt for the AI assistant'),
  ('data_sources', '{"sources": ["arxiv", "semantic_scholar", "google_news"]}', 'Enabled data sources for research'),
  ('update_frequency', '{"hours": 6}', 'Frequency of automatic AI research updates'),
  ('max_images_per_day', '{"limit": 10}', 'Maximum image generations per day per user');