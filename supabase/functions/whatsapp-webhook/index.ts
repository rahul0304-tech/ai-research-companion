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
}

const WHATSAPP_TEXT_LIMIT = 4096;

function clampWhatsAppText(input: string, limit = WHATSAPP_TEXT_LIMIT): string {
  const text = (input ?? '').toString();
  if (text.length <= limit) return text;
  const suffix = "\n\n…(trimmed)";
  return text.slice(0, Math.max(0, limit - suffix.length)) + suffix;
}

// Model Registry using Lovable AI Gateway
const MODEL_REGISTRY = {
  general_chat: 'google/gemini-2.5-flash-lite',
  heavy_reasoning: 'google/gemini-2.5-flash',
  web_search: 'google/gemini-2.5-flash-lite',
  planning: 'google/gemini-2.5-flash',
  fallback: 'google/gemini-2.5-flash-lite'
};

type TaskIntent = 'general_question' | 'web_search' | 'reasoning' | 'planning' | 'subscribe' | 'unsubscribe' | 'request_update';

// Verify Meta webhook signature
async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signature) {
    console.log('No signature provided');
    return false;
  }
  
  const signatureHash = signature.split('sha256=')[1];
  if (!signatureHash) {
    console.log('Invalid signature format');
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  const computedHash = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const isValid = computedHash === signatureHash;
  console.log('Signature verification:', { isValid, computedHash: computedHash.substring(0, 10) + '...', receivedHash: signatureHash.substring(0, 10) + '...' });
  
  return isValid;
}

// Send message via Meta WhatsApp API v21.0
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<any> {
  console.log('Sending WhatsApp message via Meta API:', { phoneNumberId, to, messageLength: message.length });
  
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
    console.log('Meta API response:', JSON.stringify(result));
    
    if (!response.ok) {
      console.error('Meta API error - Status:', response.status, 'Response:', JSON.stringify(result));
    }
    
    return result;
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error);
    return { error: String(error) };
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

    console.log('Parsed message:', { phone_number, message_content, message_id });

    if (!phone_number || !message_content) {
      console.error('Missing required data - phone_number or message_content');
      return;
    }

    // Store incoming message
    const userMessage: Message = {
      phone_number,
      sender: 'user',
      message_type: 'text',
      message_content,
      message_id,
    };

    const { error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert(userMessage);

    if (insertError) {
      console.error('Error inserting message:', insertError);
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

    const systemPromptSetting = settings?.find(s => s.setting_key === 'system_prompt');
    const systemPrompt = systemPromptSetting?.setting_value?.prompt || 
      'You are InfoNiblet, a friendly AI research assistant. Keep answers concise and include sources.';
    
    // Model is selected dynamically based on intent (Lovable AI Gateway)

    // Classify intent
    const taskIntent = classifyTaskIntent(message_content, conversationHistory);
    console.log('Classified task intent:', taskIntent);

    // Handle different intents
    let aiResponse = '';
    let toolCalls: any = null;
    let selectedModel = '';

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
      const executionResult = await executeWithLovableAI(
        lovableApiKey,
        taskIntent,
        message_content,
        conversationHistory,
        systemPrompt
      );
      
      aiResponse = executionResult.response;
      selectedModel = executionResult.model;
      toolCalls = executionResult.toolCalls;
    }

    const outboundMessage = clampWhatsAppText(aiResponse);

    // Store AI response
    const { error: storeError } = await supabase.from('whatsapp_messages').insert({
      phone_number,
      sender: 'assistant',
      message_type: 'text',
      message_content: outboundMessage,
      ai_response: outboundMessage,
      intent: taskIntent,
      tool_calls: toolCalls,
      model_used: selectedModel,
    });

    if (storeError) {
      console.error('Error storing AI response:', storeError);
    }

    // Send response via Meta API
    const sendResult = await sendWhatsAppMessage(
      whatsappPhoneNumberId,
      whatsappAccessToken,
      phone_number,
      outboundMessage
    );
    console.log('WhatsApp send result:', JSON.stringify(sendResult));
    
    console.log('Background processing completed successfully');

  } catch (error) {
    console.error('Background processing error:', error);
    // Don't throw - we've already returned 200 to Meta
  }
}

serve(async (req) => {
  console.log('Webhook called:', {
    method: req.method,
    url: req.url,
  });

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
      
      console.log('Webhook verification attempt:', { mode, token, challenge, expectedToken: verifyToken });
      
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified successfully');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
      
      console.log('Webhook verification failed');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    } catch (error) {
      console.error('GET verification error:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  // Only process POST requests for messages
  if (req.method !== 'POST') {
    console.log('Unsupported method:', req.method);
    return new Response(
      JSON.stringify({ status: 'ok' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Main POST handler - wrapped in try/catch, always return 200
  try {
    // Read body first
    const rawBody = await req.text();
    console.log('Received raw body length:', rawBody.length);

    // Verify webhook signature
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      console.error('WHATSAPP_APP_SECRET not configured');
      // Still return 200 to prevent retries
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const signature = req.headers.get('X-Hub-Signature-256');
    const isValidSignature = await verifyWebhookSignature(rawBody, signature, appSecret);
    
    if (!isValidSignature) {
      console.error('Invalid webhook signature - rejecting request');
      // Return 401 for invalid signature (Meta should not retry with same invalid sig)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Webhook signature verified successfully');

    // Parse JSON to validate it's proper payload
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Received webhook body:', JSON.stringify(body, null, 2));

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

    // Use EdgeRuntime.waitUntil for background processing
    // This allows us to return 200 immediately while processing continues
    const backgroundTask = processMessage(
      rawBody,
      supabaseUrl,
      supabaseKey,
      lovableApiKey,
      whatsappAccessToken,
      whatsappPhoneNumberId
    );

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask);
      console.log('Background task scheduled via EdgeRuntime.waitUntil');
    } else {
      // Fallback: just start the task but don't await it
      backgroundTask.catch(err => console.error('Background task error:', err));
      console.log('Background task started (no waitUntil available)');
    }

    // Return 200 OK immediately to Meta
    console.log('Returning 200 OK to Meta immediately');
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent Meta from retrying
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Shutdown handler for logging
addEventListener('beforeunload', (ev: any) => {
  console.log('Function shutdown:', ev.detail?.reason || 'unknown reason');
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

// Execute task with Lovable AI Gateway
async function executeWithLovableAI(
  apiKey: string,
  intent: TaskIntent,
  message: string,
  history: any[],
  systemPrompt: string
): Promise<{ response: string; model: string; toolCalls?: any }> {
  let selectedModel = MODEL_REGISTRY.general_chat;
  let specializedSystemPrompt = systemPrompt;

  // Keep responses short to reduce latency and avoid WhatsApp length limits
  const brevity =
    "\n\nImportant: Respond concisely (prefer <1200 characters) unless the user explicitly asks for more.";

  switch (intent) {
    case 'web_search':
      selectedModel = MODEL_REGISTRY.web_search;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nProvide current, factual information. Be concise and helpful.`;
      break;
    case 'reasoning':
      selectedModel = MODEL_REGISTRY.heavy_reasoning;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nExplain clearly and logically. Avoid unnecessary verbosity.`;
      break;
    case 'planning':
      selectedModel = MODEL_REGISTRY.planning;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nCreate a short, structured plan with clear steps.`;
      break;
    default:
      selectedModel = MODEL_REGISTRY.general_chat;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nBe friendly, concise, and helpful.`;
      break;
  }

  console.log(`Executing with Lovable AI - intent: ${intent}, model: ${selectedModel}`);

  const recentHistory = (history || []).slice(-10).filter((m: any) => m?.content);
  const messages = [
    { role: 'system', content: specializedSystemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  const maxTokens = intent === 'planning' || intent === 'reasoning' ? 800 : 500;

  const makeRequest = async (model: string, max_tokens: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      return await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          max_tokens,
          temperature: 0.4,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const startedAt = Date.now();

  try {
    let response = await makeRequest(selectedModel, maxTokens);

    // One fast retry on transient overloads
    if (!response.ok && (response.status === 429 || response.status === 503 || response.status === 504)) {
      console.warn(`Lovable AI transient error (${response.status}). Retrying with fallback model.`);
      await new Promise((r) => setTimeout(r, 400));
      selectedModel = MODEL_REGISTRY.fallback;
      response = await makeRequest(selectedModel, 400);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);

      if (response.status === 429) {
        return { response: '⏱️ Service busy. Please try again shortly.', model: selectedModel };
      }
      if (response.status === 402) {
        return { response: '⚠️ Service temporarily unavailable.', model: selectedModel };
      }
      return { response: '❌ Error occurred. Please try again.', model: selectedModel };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    const elapsedMs = Date.now() - startedAt;
    console.log('Lovable AI completed', {
      elapsedMs,
      intent,
      model: selectedModel,
      chars: typeof text === 'string' ? text.length : 0,
    });

    return {
      response: typeof text === 'string' && text.trim().length
        ? text
        : 'Sorry, I could not generate a response.',
      model: selectedModel,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.error('Lovable AI execution error:', { elapsedMs, error: String(error) });
    return { response: '❌ An error occurred.', model: selectedModel };
  }
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
