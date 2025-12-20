import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AIProvider = 'lovable' | 'openrouter' | 'openai' | 'anthropic' | 'gemini';

interface ProviderConfig {
  provider: AIProvider;
  model: string;
  api_key?: string;
  fallback_provider?: AIProvider;
  fallback_model?: string;
  fallback_api_key?: string;
}

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  lovable: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
};

// Execute AI request with fallback support
async function executeAIRequest(
  config: ProviderConfig,
  lovableApiKey: string,
  messages: any[],
  maxTokens: number,
  useFallback = false
): Promise<{ response: string; model: string; provider: string }> {
  const provider = useFallback && config.fallback_provider ? config.fallback_provider : config.provider;
  const model = useFallback && config.fallback_model ? config.fallback_model : config.model;
  const apiKey = useFallback && config.fallback_api_key 
    ? config.fallback_api_key 
    : (provider === 'lovable' ? lovableApiKey : config.api_key);
  
  console.log(`Executing AI request - provider: ${provider}, model: ${model}, fallback: ${useFallback}`);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    if (!apiKey && provider !== 'lovable') {
      throw new Error(`No API key configured for provider: ${provider}`);
    }
    
    let response: Response;
    
    if (provider === 'anthropic') {
      const systemMsg = messages.find(m => m.role === 'system');
      const otherMsgs = messages.filter(m => m.role !== 'system');
      
      response = await fetch(PROVIDER_ENDPOINTS.anthropic, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemMsg?.content || '',
          messages: otherMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      
      if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
      
      const data = await response.json();
      return {
        response: data.content?.[0]?.text || 'No response generated.',
        model,
        provider
      };
      
    } else if (provider === 'gemini') {
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      
      const systemInstruction = messages.find(m => m.role === 'system')?.content;
      
      response = await fetch(`${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 }
        }),
      });
      
      if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
      
      const data = await response.json();
      return {
        response: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.',
        model,
        provider
      };
      
    } else {
      const endpoint = PROVIDER_ENDPOINTS[provider];
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://lovable.dev';
        headers['X-Title'] = 'InfoNiblet';
      }
      
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
      });
      
      if (!response.ok) throw new Error(`${provider} error: ${response.status}`);
      
      const data = await response.json();
      return {
        response: data.choices?.[0]?.message?.content || 'No response generated.',
        model,
        provider
      };
    }
    
  } catch (error) {
    console.error(`AI request failed (fallback: ${useFallback}):`, error);
    
    // Try fallback if available and not already using it
    if (!useFallback && config.fallback_provider) {
      console.log('Attempting fallback provider...');
      return executeAIRequest(config, lovableApiKey, messages, maxTokens, true);
    }
    
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<any> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message }
      })
    }
  );
  return response.json();
}

// Track AI usage
async function trackUsage(supabase: any, provider: string, model: string, estimatedCost: number = 0) {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: existing } = await supabase
    .from('ai_usage')
    .select('*')
    .eq('provider', provider)
    .eq('model', model)
    .eq('date', today)
    .single();
  
  if (existing) {
    await supabase
      .from('ai_usage')
      .update({
        request_count: existing.request_count + 1,
        estimated_cost_usd: (Number(existing.estimated_cost_usd) || 0) + estimatedCost
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('ai_usage')
      .insert({
        provider,
        model,
        request_count: 1,
        estimated_cost_usd: estimatedCost,
        date: today
      });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!;
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get pending scheduled messages that are due
    const now = new Date().toISOString();
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now);
    
    if (fetchError) {
      console.error('Error fetching scheduled messages:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Processing ${pendingMessages.length} scheduled messages`);
    
    // Get provider config
    const { data: providerSetting } = await supabase
      .from('assistant_settings')
      .select('setting_value')
      .eq('setting_key', 'ai_provider')
      .single();
    
    const providerConfig: ProviderConfig = providerSetting?.setting_value || {
      provider: 'lovable',
      model: 'google/gemini-2.5-flash-lite'
    };
    
    // Get system prompt
    const { data: promptSetting } = await supabase
      .from('assistant_settings')
      .select('setting_value')
      .eq('setting_key', 'system_prompt')
      .single();
    
    const systemPrompt = promptSetting?.setting_value?.prompt || 
      'You are InfoNiblet, a helpful AI assistant. Be concise and informative.';
    
    let processed = 0;
    
    for (const msg of pendingMessages) {
      try {
        // Mark as processing
        await supabase
          .from('scheduled_messages')
          .update({ status: 'processing' })
          .eq('id', msg.id);
        
        let messageToSend = msg.message_content;
        let modelUsed = 'direct';
        
        // If it's an AI task, execute it
        if (msg.task_prompt) {
          const messages = [
            { role: 'system', content: systemPrompt + '\n\nExecute the following task and provide a response:' },
            { role: 'user', content: msg.task_prompt }
          ];
          
          const result = await executeAIRequest(providerConfig, lovableApiKey, messages, 800);
          messageToSend = result.response;
          modelUsed = `${result.provider}/${result.model}`;
          
          // Track usage
          await trackUsage(supabase, result.provider, result.model);
        }
        
        // Send the message
        const sendResult = await sendWhatsAppMessage(
          whatsappPhoneNumberId,
          whatsappAccessToken,
          msg.phone_number,
          messageToSend
        );
        
        if (sendResult.error) {
          throw new Error(sendResult.error.message || 'Failed to send message');
        }
        
        // Update as sent
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            ai_response: msg.task_prompt ? messageToSend : null,
            model_used: modelUsed
          })
          .eq('id', msg.id);
        
        // Also store in whatsapp_messages for history
        await supabase.from('whatsapp_messages').insert({
          phone_number: msg.phone_number,
          sender: 'assistant',
          message_type: 'text',
          message_content: messageToSend,
          ai_response: messageToSend,
          model_used: modelUsed,
          intent: msg.task_prompt ? 'scheduled_task' : 'scheduled_message',
          processing_status: 'sent'
        });
        
        processed++;
        console.log(`Sent scheduled message ${msg.id} to ${msg.phone_number}`);
        
      } catch (error) {
        console.error(`Failed to process message ${msg.id}:`, error);
        
        await supabase
          .from('scheduled_messages')
          .update({ status: 'failed' })
          .eq('id', msg.id);
      }
    }

    return new Response(JSON.stringify({ processed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing scheduled messages:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
