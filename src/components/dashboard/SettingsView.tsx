import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Save } from "lucide-react";
import { toast } from "sonner";

interface Setting {
  id: string;
  setting_key: string;
  setting_value: any;
  description?: string;
}

export const SettingsView = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState(6);
  const [maxImagesPerDay, setMaxImagesPerDay] = useState(10);
  const [openRouterModel, setOpenRouterModel] = useState('nvidia/nemotron-nano-12b-v2-vl:free');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('assistant_settings')
      .select('*');

    if (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load settings');
    } else {
      setSettings(data || []);
      
      // Parse settings
      const promptSetting = data?.find(s => s.setting_key === 'system_prompt');
      if (promptSetting && typeof promptSetting.setting_value === 'object' && promptSetting.setting_value !== null) {
        const value = promptSetting.setting_value as any;
        setSystemPrompt(value.prompt || '');
      }
      
      const freqSetting = data?.find(s => s.setting_key === 'update_frequency');
      if (freqSetting && typeof freqSetting.setting_value === 'object' && freqSetting.setting_value !== null) {
        const value = freqSetting.setting_value as any;
        setUpdateFrequency(value.hours || 6);
      }
      
      const imagesSetting = data?.find(s => s.setting_key === 'max_images_per_day');
      if (imagesSetting && typeof imagesSetting.setting_value === 'object' && imagesSetting.setting_value !== null) {
        const value = imagesSetting.setting_value as any;
        setMaxImagesPerDay(value.limit || 10);
      }
      
      const modelSetting = data?.find(s => s.setting_key === 'openrouter_model');
      if (modelSetting && typeof modelSetting.setting_value === 'object' && modelSetting.setting_value !== null) {
        const value = modelSetting.setting_value as any;
        setOpenRouterModel(value.model || 'openai/gpt-4o');
      }
    }
    setLoading(false);
  };

  const handleSaveSettings = async () => {
    try {
      // Update system prompt
      await supabase
        .from('assistant_settings')
        .update({ setting_value: { prompt: systemPrompt } })
        .eq('setting_key', 'system_prompt');

      // Update frequency
      await supabase
        .from('assistant_settings')
        .update({ setting_value: { hours: updateFrequency } })
        .eq('setting_key', 'update_frequency');

      // Update max images
      await supabase
        .from('assistant_settings')
        .update({ setting_value: { limit: maxImagesPerDay } })
        .eq('setting_key', 'max_images_per_day');

      // Update OpenRouter model
      await supabase
        .from('assistant_settings')
        .upsert({ 
          setting_key: 'openrouter_model', 
          setting_value: { model: openRouterModel },
          description: 'OpenRouter AI model selection'
        }, { onConflict: 'setting_key' });

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Assistant Configuration
          </CardTitle>
          <CardDescription>Configure how InfoNiblet responds and behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter the system prompt for the AI assistant..."
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              This prompt defines how the AI assistant behaves and responds to users
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="update-frequency">Update Frequency (hours)</Label>
            <Input
              id="update-frequency"
              type="number"
              min="1"
              max="24"
              value={updateFrequency}
              onChange={(e) => setUpdateFrequency(parseInt(e.target.value) || 6)}
            />
            <p className="text-xs text-muted-foreground">
              How often to send automated research updates to subscribers
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-images">Max Images Per Day</Label>
            <Input
              id="max-images"
              type="number"
              min="0"
              max="100"
              value={maxImagesPerDay}
              onChange={(e) => setMaxImagesPerDay(parseInt(e.target.value) || 10)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of AI-generated images per user per day
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openrouter-model">OpenRouter AI Model</Label>
            <Input
              id="openrouter-model"
              type="text"
              value={openRouterModel}
              onChange={(e) => setOpenRouterModel(e.target.value)}
              placeholder="e.g., openai/gpt-4o, anthropic/claude-3.5-sonnet"
            />
            <p className="text-xs text-muted-foreground">
              Choose from OpenRouter's available models. Popular: openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-pro
            </p>
          </div>

          <Button 
            onClick={handleSaveSettings} 
            className="w-full bg-gradient-primary text-white shadow-glow transition-smooth hover:shadow-lg"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Webhook Configuration</CardTitle>
          <CardDescription>Use this endpoint for WhatsApp webhooks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm break-all">
            {import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Configure this URL in your Twilio or WhatsApp Business API settings
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Data Sources</CardTitle>
          <CardDescription>Configure external research sources</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm">arXiv</span>
              <span className="text-xs text-primary">Enabled</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm">Semantic Scholar</span>
              <span className="text-xs text-primary">Enabled</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm">Google News</span>
              <span className="text-xs text-primary">Enabled</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
