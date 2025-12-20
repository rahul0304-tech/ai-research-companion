import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings, Save, Copy, CheckCircle, Key, Bot, Shield } from "lucide-react";
import { toast } from "sonner";

interface Setting {
  id: string;
  setting_key: string;
  setting_value: any;
  description?: string;
}

type AIProvider = 'lovable' | 'openrouter' | 'openai' | 'anthropic' | 'gemini';

const AI_PROVIDERS: { id: AIProvider; name: string; requiresKey: boolean; models: string[] }[] = [
  { 
    id: 'lovable', 
    name: 'Lovable AI (Free)', 
    requiresKey: false,
    models: [
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'openai/gpt-5-nano',
      'openai/gpt-5-mini',
      'openai/gpt-5'
    ]
  },
  { 
    id: 'openrouter', 
    name: 'OpenRouter', 
    requiresKey: true,
    models: [
      'deepseek/deepseek-chat-v3-0324:free',
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'google/gemini-2.0-flash-exp:free',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct'
    ]
  },
  { 
    id: 'openai', 
    name: 'OpenAI', 
    requiresKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  { 
    id: 'anthropic', 
    name: 'Anthropic', 
    requiresKey: true,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
  },
  { 
    id: 'gemini', 
    name: 'Google Gemini', 
    requiresKey: true,
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
  },
];

export const SettingsView = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState(6);
  const [maxImagesPerDay, setMaxImagesPerDay] = useState(10);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [copied, setCopied] = useState(false);
  
  // AI Provider settings
  const [aiProvider, setAiProvider] = useState<AIProvider>('lovable');
  const [aiModel, setAiModel] = useState('google/gemini-2.5-flash-lite');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  
  // Fallback provider settings
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallbackProvider, setFallbackProvider] = useState<AIProvider>('lovable');
  const [fallbackModel, setFallbackModel] = useState('google/gemini-2.5-flash-lite');
  const [fallbackApiKey, setFallbackApiKey] = useState('');
  const [fallbackApiKeySet, setFallbackApiKeySet] = useState(false);

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

      const phoneSetting = data?.find(s => s.setting_key === 'whatsapp_phone_number_id');
      if (phoneSetting?.setting_value && typeof phoneSetting.setting_value === 'object') {
        const val = phoneSetting.setting_value as Record<string, unknown>;
        if (val.phone_number_id) setPhoneNumberId(val.phone_number_id as string);
      }

      // Load AI provider settings
      const providerSetting = data?.find(s => s.setting_key === 'ai_provider');
      if (providerSetting?.setting_value && typeof providerSetting.setting_value === 'object') {
        const val = providerSetting.setting_value as Record<string, unknown>;
        if (val.provider) setAiProvider(val.provider as AIProvider);
        if (val.model) setAiModel(val.model as string);
        if (val.api_key_set) setApiKeySet(val.api_key_set as boolean);
        
        // Load fallback settings
        if (val.fallback_enabled) setFallbackEnabled(val.fallback_enabled as boolean);
        if (val.fallback_provider) setFallbackProvider(val.fallback_provider as AIProvider);
        if (val.fallback_model) setFallbackModel(val.fallback_model as string);
        if (val.fallback_api_key_set) setFallbackApiKeySet(val.fallback_api_key_set as boolean);
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
          setting_key: 'whatsapp_phone_number_id', 
          setting_value: { phone_number_id: phoneNumberId },
          description: 'Meta WhatsApp Phone Number ID'
        }, { onConflict: 'setting_key' });

      // Save AI provider settings with fallback
      const providerConfig: any = {
        provider: aiProvider,
        model: aiModel,
        api_key_set: apiKeySet || (apiKey.length > 0),
        fallback_enabled: fallbackEnabled,
        fallback_provider: fallbackProvider,
        fallback_model: fallbackModel,
        fallback_api_key_set: fallbackApiKeySet || (fallbackApiKey.length > 0)
      };
      
      // Only include API key if it's being set/updated
      if (apiKey.length > 0) {
        providerConfig.api_key = apiKey;
        providerConfig.api_key_set = true;
      }
      
      // Include fallback API key if set
      if (fallbackApiKey.length > 0) {
        providerConfig.fallback_api_key = fallbackApiKey;
        providerConfig.fallback_api_key_set = true;
      }

      await supabase
        .from('assistant_settings')
        .upsert({ 
          setting_key: 'ai_provider', 
          setting_value: providerConfig,
          description: 'AI Provider Configuration'
        }, { onConflict: 'setting_key' });

      if (apiKey.length > 0) {
        setApiKey('');
        setApiKeySet(true);
      }
      
      if (fallbackApiKey.length > 0) {
        setFallbackApiKey('');
        setFallbackApiKeySet(true);
      }

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

  const handleProviderChange = (provider: AIProvider) => {
    setAiProvider(provider);
    const providerConfig = AI_PROVIDERS.find(p => p.id === provider);
    if (providerConfig && providerConfig.models.length > 0) {
      setAiModel(providerConfig.models[0]);
    }
    setApiKey('');
    setApiKeySet(false);
  };

  const handleFallbackProviderChange = (provider: AIProvider) => {
    setFallbackProvider(provider);
    const providerConfig = AI_PROVIDERS.find(p => p.id === provider);
    if (providerConfig && providerConfig.models.length > 0) {
      setFallbackModel(providerConfig.models[0]);
    }
    setFallbackApiKey('');
    setFallbackApiKeySet(false);
  };

  const currentProvider = AI_PROVIDERS.find(p => p.id === aiProvider);
  const currentFallbackProvider = AI_PROVIDERS.find(p => p.id === fallbackProvider);

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
      {/* AI Provider Configuration */}
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            AI Provider
          </CardTitle>
          <CardDescription>Choose your preferred AI provider and model</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={aiProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map(provider => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentProvider?.models.map(model => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentProvider?.requiresKey && (
            <div className="space-y-2">
              <Label htmlFor="api-key" className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Key
                {apiKeySet && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Configured
                  </span>
                )}
              </Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeySet ? '••••••••••••••••' : `Enter your ${currentProvider.name} API key`}
              />
              <p className="text-xs text-muted-foreground">
                {aiProvider === 'openrouter' && 'Get your API key from openrouter.ai'}
                {aiProvider === 'openai' && 'Get your API key from platform.openai.com'}
                {aiProvider === 'anthropic' && 'Get your API key from console.anthropic.com'}
                {aiProvider === 'gemini' && 'Get your API key from aistudio.google.com'}
              </p>
            </div>
          )}

          {aiProvider === 'lovable' && (
            <div className="bg-primary/10 text-primary text-sm p-3 rounded-lg">
              Lovable AI is free and requires no API key. It provides access to Google Gemini and OpenAI models.
            </div>
          )}
          
          {/* Fallback Provider Section */}
          <div className="border-t border-border/50 pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">Fallback Provider</Label>
                  <p className="text-xs text-muted-foreground">Automatically use backup if primary fails</p>
                </div>
              </div>
              <Switch
                checked={fallbackEnabled}
                onCheckedChange={setFallbackEnabled}
              />
            </div>
            
            {fallbackEnabled && (
              <div className="space-y-4 pl-7">
                <div className="space-y-2">
                  <Label>Fallback Provider</Label>
                  <Select value={fallbackProvider} onValueChange={(v) => handleFallbackProviderChange(v as AIProvider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_PROVIDERS.filter(p => p.id !== aiProvider).map(provider => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fallback Model</Label>
                  <Select value={fallbackModel} onValueChange={setFallbackModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentFallbackProvider?.models.map(model => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {currentFallbackProvider?.requiresKey && (
                  <div className="space-y-2">
                    <Label htmlFor="fallback-api-key" className="flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Fallback API Key
                      {fallbackApiKeySet && (
                        <span className="text-xs text-green-500 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Configured
                        </span>
                      )}
                    </Label>
                    <Input
                      id="fallback-api-key"
                      type="password"
                      value={fallbackApiKey}
                      onChange={(e) => setFallbackApiKey(e.target.value)}
                      placeholder={fallbackApiKeySet ? '••••••••••••••••' : `Enter your ${currentFallbackProvider.name} API key`}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
