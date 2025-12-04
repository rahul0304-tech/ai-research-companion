import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Save, Copy, CheckCircle } from "lucide-react";
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
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

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
      
      const promptSetting = data?.find(s => s.setting_key === 'system_prompt');
      if (promptSetting?.setting_value && typeof promptSetting.setting_value === 'object') {
        const val = promptSetting.setting_value as Record<string, unknown>;
        if (val.prompt) setSystemPrompt(val.prompt as string);
      }
      
      const freqSetting = data?.find(s => s.setting_key === 'update_frequency');
      if (freqSetting?.setting_value && typeof freqSetting.setting_value === 'object') {
        const val = freqSetting.setting_value as Record<string, unknown>;
        if (val.hours) setUpdateFrequency(val.hours as number);
      }
      
      const imagesSetting = data?.find(s => s.setting_key === 'max_images_per_day');
      if (imagesSetting?.setting_value && typeof imagesSetting.setting_value === 'object') {
        const val = imagesSetting.setting_value as Record<string, unknown>;
        if (val.limit) setMaxImagesPerDay(val.limit as number);
      }
      
      const modelSetting = data?.find(s => s.setting_key === 'openrouter_model');
      if (modelSetting?.setting_value && typeof modelSetting.setting_value === 'object') {
        const val = modelSetting.setting_value as Record<string, unknown>;
        if (val.model) setOpenRouterModel(val.model as string);
      }

      const phoneSetting = data?.find(s => s.setting_key === 'whatsapp_phone_number_id');
      if (phoneSetting?.setting_value && typeof phoneSetting.setting_value === 'object') {
        const val = phoneSetting.setting_value as Record<string, unknown>;
        if (val.phone_number_id) setPhoneNumberId(val.phone_number_id as string);
      }
    }
    setLoading(false);
  };

  const handleSaveSettings = async () => {
    try {
      await supabase
        .from('assistant_settings')
        .update({ setting_value: { prompt: systemPrompt } })
        .eq('setting_key', 'system_prompt');

      await supabase
        .from('assistant_settings')
        .update({ setting_value: { hours: updateFrequency } })
        .eq('setting_key', 'update_frequency');

      await supabase
        .from('assistant_settings')
        .update({ setting_value: { limit: maxImagesPerDay } })
        .eq('setting_key', 'max_images_per_day');

      await supabase
        .from('assistant_settings')
        .upsert({ 
          setting_key: 'openrouter_model', 
          setting_value: { model: openRouterModel },
          description: 'OpenRouter AI model'
        }, { onConflict: 'setting_key' });

      await supabase
        .from('assistant_settings')
        .upsert({ 
          setting_key: 'whatsapp_phone_number_id', 
          setting_value: { phone_number_id: phoneNumberId },
          description: 'Meta WhatsApp Phone Number ID'
        }, { onConflict: 'setting_key' });

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied!');
    setTimeout(() => setCopied(false), 2000);
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="openrouter-model">OpenRouter AI Model</Label>
            <Input
              id="openrouter-model"
              type="text"
              value={openRouterModel}
              onChange={(e) => setOpenRouterModel(e.target.value)}
              placeholder="e.g., deepseek/deepseek-chat-v3-0324:free"
            />
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
          <CardTitle className="text-lg">Meta WhatsApp Configuration</CardTitle>
          <CardDescription>Configure your WhatsApp Business API connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone-number-id">WhatsApp Phone Number ID</Label>
            <Input
              id="phone-number-id"
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Enter your Phone Number ID from Meta"
            />
            <p className="text-xs text-muted-foreground">
              Find this in Meta Business Suite → WhatsApp → API Setup
            </p>
          </div>

          <div className="space-y-2">
            <Label>Callback URL</Label>
            <div className="flex gap-2">
              <div className="flex-1 bg-muted/50 p-3 rounded-lg font-mono text-sm break-all">
                {webhookUrl}
              </div>
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Verify Token</Label>
            <p className="text-sm text-muted-foreground">
              Use the <code className="bg-muted px-1 rounded">WHATSAPP_VERIFY_TOKEN</code> you configured in secrets
            </p>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Setup Instructions:</h4>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to Meta Business Suite → WhatsApp → API Setup</li>
              <li>Under Webhooks, click "Configure"</li>
              <li>Paste the Callback URL above</li>
              <li>Enter your Verify Token</li>
              <li>Subscribe to "messages" webhook field</li>
              <li>Save your Phone Number ID above</li>
            </ol>
          </div>
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
