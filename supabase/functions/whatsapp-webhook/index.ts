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
    
    // Find a good split point (prefer paragraph, sentence, or word boundary)
    let splitAt = limit - 20; // Leave room for part indicator
    const chunk = remaining.slice(0, limit - 20);
    
    // Try to split at paragraph
    const paraBreak = chunk.lastIndexOf('\n\n');
    if (paraBreak > limit / 2) {
      splitAt = paraBreak;
    } else {
      // Try sentence
      const sentenceBreak = Math.max(
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf('! '),
        chunk.lastIndexOf('? ')
      );
      if (sentenceBreak > limit / 2) {
        splitAt = sentenceBreak + 1;
      } else {
        // Try word boundary
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
  
  // Update part counts
  const total = parts.length;
  return parts.map((p, i) => p.replace('(...)', `(${total})`));
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
      // If insert fails due to duplicate, skip
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

    // Classify intent
    const taskIntent = classifyTaskIntent(message_content, conversationHistory);
    console.log('Classified intent:', taskIntent);

    // Handle different intents
    let aiResponse = '';
    let toolCalls: any = null;
    let selectedModel = '';
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
      const executionResult = await executeWithLovableAI(
        lovableApiKey,
        taskIntent,
        message_content,
        conversationHistory,
        systemPrompt
      );
      aiLatencyMs = Date.now() - aiStart;
      
      aiResponse = executionResult.response;
      selectedModel = executionResult.model;
      toolCalls = executionResult.toolCalls;
    }

    const totalLatencyMs = Date.now() - totalStart;
    console.log('Latency metrics:', { aiLatencyMs, totalLatencyMs });

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
      
      // Small delay between multi-part messages
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

  const brevity = "\n\nImportant: Respond concisely (prefer <1200 characters) unless asked for more.";

  switch (intent) {
    case 'web_search':
      selectedModel = MODEL_REGISTRY.web_search;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nProvide current, factual information. Be concise.`;
      break;
    case 'reasoning':
      selectedModel = MODEL_REGISTRY.heavy_reasoning;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nExplain clearly and logically.`;
      break;
    case 'planning':
      selectedModel = MODEL_REGISTRY.planning;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nCreate a short, structured plan.`;
      break;
    default:
      selectedModel = MODEL_REGISTRY.general_chat;
      specializedSystemPrompt = `${systemPrompt}${brevity}\n\nBe friendly and helpful.`;
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

  try {
    let response = await makeRequest(selectedModel, maxTokens);

    // Retry on transient errors
    if (!response.ok && (response.status === 429 || response.status === 503 || response.status === 504)) {
      console.warn(`Transient error (${response.status}), retrying with fallback`);
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

    return {
      response: typeof text === 'string' && text.trim().length
        ? text
        : 'Sorry, I could not generate a response.',
      model: selectedModel,
    };
  } catch (error) {
    console.error('Lovable AI execution error:', String(error));
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
