import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  phone_number: string;
  sender: 'user' | 'assistant';
  message_type: string;
  message_content: string;
  message_id?: string;
  intent?: string;
  tool_calls?: any;
  ai_response?: string;
  model_used?: string;
  ai_latency_ms?: number;
  total_latency_ms?: number;
  processing_status?: string;
}

type AIProvider = 'lovable' | 'openrouter' | 'openai' | 'anthropic' | 'gemini';

interface ProviderConfig {
  provider: AIProvider;
  model: string;
  api_key?: string;
  api_key_set?: boolean;
}

const WHATSAPP_TEXT_LIMIT = 4096;

function splitWhatsAppMessage(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
  if (!text || text.length <= limit) return [text];
  
  const parts: string[] = [];
  let remaining = text;
  let partNum = 1;
  
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      parts.push(remaining);
      break;
    }
    
    let splitAt = limit - 20;
    const chunk = remaining.slice(0, limit - 20);
    
    const paraBreak = chunk.lastIndexOf('\n\n');
    if (paraBreak > limit / 2) {
      splitAt = paraBreak;
    } else {
      const sentenceBreak = Math.max(
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf('! '),
        chunk.lastIndexOf('? ')
      );
      if (sentenceBreak > limit / 2) {
        splitAt = sentenceBreak + 1;
      } else {
        const wordBreak = chunk.lastIndexOf(' ');
        if (wordBreak > limit / 2) {
          splitAt = wordBreak;
        }
      }
    }
    
    parts.push(remaining.slice(0, splitAt).trim() + `\n\n(${partNum}/...)`);
    remaining = remaining.slice(splitAt).trim();
    partNum++;
  }
  
  const total = parts.length;
  return parts.map((p, i) => p.replace('(...)', `(${total})`));
}

// Provider API endpoints and configurations
const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  lovable: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
};

type TaskIntent = 'general_question' | 'web_search' | 'reasoning' | 'planning' | 'subscribe' | 'unsubscribe' | 'request_update';

// Verify Meta webhook signature
async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signature) return false;
  
  const signatureHash = signature.split('sha256=')[1];
  if (!signatureHash) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computedHash = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHash === signatureHash;
}

// Send message via Meta WhatsApp API v21.0
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<any> {
  console.log('Sending WhatsApp message:', { to, messageLength: message.length });
  
  try {
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
          to: to,
          type: 'text',
          text: { body: message }
        })
      }
    );
    
    const result = await response.json();
    if (!response.ok) {
      console.error('Meta API error:', response.status, JSON.stringify(result));
    }
    return result;
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error);
    return { error: String(error) };
  }
}

// Check for duplicate message
async function isDuplicateMessage(supabase: any, messageId: string): Promise<boolean> {
  if (!messageId) return false;
  
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .limit(1);
  
  return data && data.length > 0;
}

// Update message processing status
async function updateProcessingStatus(supabase: any, messageId: string, status: string): Promise<void> {
  if (!messageId) return;
  
  await supabase
    .from('whatsapp_messages')
    .update({ processing_status: status })
    .eq('message_id', messageId);
}

// Get provider configuration from settings
async function getProviderConfig(supabase: any): Promise<ProviderConfig> {
  const { data } = await supabase
    .from('assistant_settings')
    .select('setting_value')
    .eq('setting_key', 'ai_provider')
    .single();
  
  if (data?.setting_value) {
    return {
      provider: data.setting_value.provider || 'lovable',
      model: data.setting_value.model || 'google/gemini-2.5-flash-lite',
      api_key: data.setting_value.api_key,
      api_key_set: data.setting_value.api_key_set
    };
  }
  
  return { provider: 'lovable', model: 'google/gemini-2.5-flash-lite' };
}

// Execute AI request based on provider
async function executeAIRequest(
  providerConfig: ProviderConfig,
  lovableApiKey: string,
  messages: any[],
  maxTokens: number
): Promise<{ response: string; model: string }> {
  const { provider, model, api_key } = providerConfig;
  
  console.log(`Executing AI request - provider: ${provider}, model: ${model}`);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  
  try {
    let response: Response;
    let apiKey = provider === 'lovable' ? lovableApiKey : api_key;
    
    if (!apiKey && provider !== 'lovable') {
      console.error(`No API key configured for provider: ${provider}`);
      return { response: '⚠️ API key not configured. Please add your API key in Settings.', model };
    }
    
    if (provider === 'anthropic') {
      // Anthropic has different API format
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
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Anthropic API error:', response.status, errorText);
        throw new Error(`Anthropic API error: ${response.status}`);
      }
      
      const data = await response.json();
      return {
        response: data.content?.[0]?.text || 'No response generated.',
        model
      };
      
    } else if (provider === 'gemini') {
      // Gemini API format
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
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }
      
      const data = await response.json();
      return {
        response: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.',
        model
      };
      
    } else {
      // OpenAI-compatible format (Lovable, OpenRouter, OpenAI)
      const endpoint = PROVIDER_ENDPOINTS[provider];
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      
      // OpenRouter needs additional headers
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
      
      // Handle transient errors with retry
      if (!response.ok && (response.status === 429 || response.status === 503 || response.status === 504)) {
        console.warn(`Transient error (${response.status}), retrying...`);
        await new Promise(r => setTimeout(r, 500));
        
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: Math.min(maxTokens, 400),
            temperature: 0.4,
          }),
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${provider} API error:`, response.status, errorText);
        
        if (response.status === 429) {
          return { response: '⏱️ Rate limit reached. Please try again shortly.', model };
        }
        if (response.status === 402) {
          return { response: '⚠️ API credits exhausted. Please check your account.', model };
        }
        if (response.status === 401) {
          return { response: '⚠️ Invalid API key. Please check your settings.', model };
        }
        throw new Error(`${provider} API error: ${response.status}`);
      }
      
      const data = await response.json();
      return {
        response: data.choices?.[0]?.message?.content || 'No response generated.',
        model
      };
    }
    
  } catch (error) {
    console.error('AI execution error:', String(error));
    if (String(error).includes('abort')) {
      return { response: '⏱️ Request timed out. Please try again.', model };
    }
    return { response: '❌ An error occurred. Please try again.', model };
  } finally {
    clearTimeout(timeout);
  }
}

// Background processing function
async function processMessage(
  rawBody: string,
  supabaseUrl: string,
  supabaseKey: string,
  lovableApiKey: string,
  whatsappAccessToken: string,
  whatsappPhoneNumberId: string
): Promise<void> {
  const totalStart = Date.now();
  
  try {
    console.log('Starting background message processing');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = JSON.parse(rawBody);

    // Check if this is a status update (not a message)
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      console.log('Received status update, ignoring');
      return;
    }

    // Extract message from Meta format
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log('No messages in webhook payload');
      return;
    }

    const msg = messages[0];
    const phone_number = msg.from;
    const message_content = msg.text?.body || msg.caption || '';
    const message_id = msg.id;

    console.log('Parsed message:', { phone_number, message_id });

    if (!phone_number || !message_content) {
      console.error('Missing required data');
      return;
    }

    // De-duplication check
    if (await isDuplicateMessage(supabase, message_id)) {
      console.log('Duplicate message detected, skipping:', message_id);
      return;
    }

    // Store incoming message with processing status
    const userMessage: Message = {
      phone_number,
      sender: 'user',
      message_type: 'text',
      message_content,
      message_id,
      processing_status: 'processing',
    };

    const { error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert(userMessage);

    if (insertError) {
      console.error('Error inserting message:', insertError);
      if (insertError.code === '23505') {
        console.log('Duplicate insert detected, skipping');
        return;
      }
    }

    // Get conversation history (last 20 messages)
    const { data: history } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('phone_number', phone_number)
      .order('received_at', { ascending: false })
      .limit(20);

    const conversationHistory = (history || [])
      .reverse()
      .map((m: any) => {
        const role = m.sender === 'user' ? 'user' : 'assistant';
        const content = m.sender === 'user'
          ? m.message_content
          : (m.ai_response ?? m.message_content ?? '');
        return typeof content === 'string' && content.trim().length
          ? { role, content }
          : null;
      })
      .filter(Boolean);

    // Get assistant settings
    const { data: settings } = await supabase
      .from('assistant_settings')
      .select('*');

    const systemPromptSetting = settings?.find((s: any) => s.setting_key === 'system_prompt');
    const systemPrompt = systemPromptSetting?.setting_value?.prompt || 
      'You are InfoNiblet, a friendly AI research assistant. Keep answers concise and include sources.';

    // Get provider configuration
    const providerConfig = await getProviderConfig(supabase);
    console.log('Using provider:', providerConfig.provider, 'model:', providerConfig.model);

    // Classify intent
    const taskIntent = classifyTaskIntent(message_content, conversationHistory);
    console.log('Classified intent:', taskIntent);

    // Handle different intents
    let aiResponse = '';
    let toolCalls: any = null;
    let selectedModel = providerConfig.model;
    let aiLatencyMs = 0;

    if (taskIntent === 'subscribe') {
      const result = await handleSubscription(supabase, phone_number, 'subscribe');
      aiResponse = result.message;
      selectedModel = 'system';
    } else if (taskIntent === 'unsubscribe') {
      const result = await handleSubscription(supabase, phone_number, 'unsubscribe');
      aiResponse = result.message;
      selectedModel = 'system';
    } else if (taskIntent === 'request_update') {
      const { data: updates } = await supabase
        .from('ai_updates')
        .select('title, summary, scheduled_for')
        .eq('status', 'sent')
        .order('scheduled_for', { ascending: false })
        .limit(3);
      
      if (updates && updates.length > 0) {
        aiResponse = '📰 *Latest AI Updates*\n\n';
        updates.forEach((update: any, idx: number) => {
          aiResponse += `${idx + 1}. *${update.title}*\n${update.summary}\n\n`;
        });
      } else {
        aiResponse = '📰 No recent updates available. Check back soon!';
      }
      selectedModel = 'system';
    } else {
      const aiStart = Date.now();
      
      const brevity = "\n\nImportant: Respond concisely (prefer <1200 characters) unless asked for more.";
      let specializedPrompt = systemPrompt + brevity;
      
      switch (taskIntent) {
        case 'web_search':
          specializedPrompt += '\n\nProvide current, factual information. Be concise.';
          break;
        case 'reasoning':
          specializedPrompt += '\n\nExplain clearly and logically.';
          break;
        case 'planning':
          specializedPrompt += '\n\nCreate a short, structured plan.';
          break;
        default:
          specializedPrompt += '\n\nBe friendly and helpful.';
          break;
      }
      
      const recentHistory = (conversationHistory || []).slice(-10).filter((m: any) => m?.content);
      const aiMessages = [
        { role: 'system', content: specializedPrompt },
        ...recentHistory,
        { role: 'user', content: message_content },
      ];
      
      const maxTokens = taskIntent === 'planning' || taskIntent === 'reasoning' ? 800 : 500;
      
      const result = await executeAIRequest(providerConfig, lovableApiKey, aiMessages, maxTokens);
      aiLatencyMs = Date.now() - aiStart;
      
      aiResponse = result.response;
      selectedModel = `${providerConfig.provider}/${result.model}`;
    }

    const totalLatencyMs = Date.now() - totalStart;
    console.log('Latency metrics:', { aiLatencyMs, totalLatencyMs, provider: providerConfig.provider });

    // Split long messages into parts
    const messageParts = splitWhatsAppMessage(aiResponse);
    console.log('Message parts:', messageParts.length);

    // Update user message status to completed
    await updateProcessingStatus(supabase, message_id, 'completed');

    // Store AI response with latency metrics
    const { error: storeError } = await supabase.from('whatsapp_messages').insert({
      phone_number,
      sender: 'assistant',
      message_type: 'text',
      message_content: aiResponse,
      ai_response: aiResponse,
      intent: taskIntent,
      tool_calls: toolCalls,
      model_used: selectedModel,
      ai_latency_ms: aiLatencyMs,
      total_latency_ms: totalLatencyMs,
      processing_status: 'sent',
    });

    if (storeError) {
      console.error('Error storing AI response:', storeError);
    }

    // Send all message parts
    for (let i = 0; i < messageParts.length; i++) {
      const sendResult = await sendWhatsAppMessage(
        whatsappPhoneNumberId,
        whatsappAccessToken,
        phone_number,
        messageParts[i]
      );
      console.log(`WhatsApp send result (part ${i + 1}/${messageParts.length}):`, sendResult?.messages?.[0]?.id || 'error');
      
      if (i < messageParts.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    
    console.log('Background processing completed');

  } catch (error) {
    console.error('Background processing error:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle Meta webhook verification (GET request)
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
      
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified successfully');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
      
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    } catch (error) {
      console.error('GET verification error:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  // Only process POST requests for messages
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ status: 'ok' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Main POST handler
  try {
    const rawBody = await req.text();

    // Verify webhook signature
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      console.error('WHATSAPP_APP_SECRET not configured');
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const signature = req.headers.get('X-Hub-Signature-256');
    const isValidSignature = await verifyWebhookSignature(rawBody, signature, appSecret);
    
    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse JSON
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

    if (!supabaseUrl || !supabaseKey || !lovableApiKey || !whatsappAccessToken || !whatsappPhoneNumberId) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Background processing
    const backgroundTask = processMessage(
      rawBody,
      supabaseUrl,
      supabaseKey,
      lovableApiKey,
      whatsappAccessToken,
      whatsappPhoneNumberId
    );

    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask);
    } else {
      backgroundTask.catch(err => console.error('Background task error:', err));
    }

    // Return 200 OK immediately
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Rule-based intent classification
function classifyTaskIntent(message: string, history: any[]): TaskIntent {
  const lower = message.toLowerCase();
  
  if (lower.includes('subscribe') || lower.includes('sign up') || lower === '3') {
    return 'subscribe';
  }
  if (lower.includes('unsubscribe') || lower.includes('stop') || lower.includes('cancel')) {
    return 'unsubscribe';
  }
  if (lower.includes('latest') || lower.includes('update') || lower.includes('news') || lower === '1') {
    return 'request_update';
  }
  
  if (
    lower.includes('hotel') || lower.includes('restaurant') || lower.includes('weather') ||
    lower.includes('current') || lower.includes('today') || lower.includes('now') ||
    lower.includes('search for') || lower.includes('find me') || lower.includes('where can i')
  ) {
    return 'web_search';
  }
  
  if (
    lower.includes('plan') || lower.includes('itinerary') || lower.includes('schedule') ||
    lower.includes('create a') && (lower.includes('trip') || lower.includes('roadmap')) ||
    lower.includes('step by step')
  ) {
    return 'planning';
  }
  
  if (
    lower.includes('calculate') || lower.includes('solve') || lower.includes('analyze') ||
    lower.includes('compare') || lower.includes('why') && lower.includes('how') ||
    lower.includes('explain') && lower.includes('detail')
  ) {
    return 'reasoning';
  }
  
  return 'general_question';
}

async function handleSubscription(supabase: any, phone: string, action: 'subscribe' | 'unsubscribe') {
  if (action === 'subscribe') {
    const { error } = await supabase
      .from('subscriptions')
      .upsert({ phone_number: phone, active: true }, { onConflict: 'phone_number' });
    
    return {
      success: !error,
      message: error 
        ? '❌ Subscription failed. Please try again.'
        : '✅ Subscribed! You\'ll get AI news updates. Reply STOP to unsubscribe.'
    };
  } else {
    const { error } = await supabase
      .from('subscriptions')
      .update({ active: false })
      .eq('phone_number', phone);
    
    return {
      success: !error,
      message: error
        ? '❌ Failed to unsubscribe. Please try again.'
        : '👋 Unsubscribed. Reply SUBSCRIBE to start again.'
    };
  }
}
