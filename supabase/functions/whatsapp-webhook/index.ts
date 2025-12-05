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

// Model Registry with specialized capabilities (using most reliable free models)
const MODEL_REGISTRY = {
  general_chat: 'deepseek/deepseek-chat-v3-0324:free',
  heavy_reasoning: 'deepseek/deepseek-r1:free',
  web_search: 'deepseek/deepseek-chat-v3-0324:free',
  planning: 'deepseek/deepseek-r1:free',
  fallback: 'nvidia/nemotron-nano-12b-v2-vl:free'
};

type TaskIntent = 'general_question' | 'web_search' | 'reasoning' | 'planning' | 'subscribe' | 'unsubscribe' | 'request_update';

// Send message via Meta WhatsApp API v21.0
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, message: string) {
  console.log('Sending WhatsApp message via Meta API:', { phoneNumberId, to, messageLength: message.length });
  
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
  console.log('Meta API response:', result);
  return result;
}

serve(async (req) => {
  console.log('Webhook called:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle Meta webhook verification (GET request)
  if (req.method === 'GET') {
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
  }

  // Only process POST requests for messages
  if (req.method !== 'POST') {
    console.log('Unsupported method:', req.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')!;
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!;
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse Meta webhook payload
    const body = await req.json();
    console.log('Received webhook body:', JSON.stringify(body, null, 2));

    // Acknowledge receipt immediately (Meta requires quick response)
    // We'll process the message after

    // Check if this is a status update (not a message)
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      console.log('Received status update, ignoring');
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract message from Meta format
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log('No messages in webhook payload');
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const msg = messages[0];
    const phone_number = msg.from;
    const message_content = msg.text?.body || msg.caption || '';
    const message_id = msg.id;

    console.log('Parsed message:', { phone_number, message_content, message_id });

    if (!phone_number || !message_content) {
      console.error('Missing required data');
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    const conversationHistory = (history || []).reverse().map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.sender === 'user' ? msg.message_content : msg.ai_response,
    }));

    // Get assistant settings
    const { data: settings } = await supabase
      .from('assistant_settings')
      .select('*');

    const systemPromptSetting = settings?.find(s => s.setting_key === 'system_prompt');
    const systemPrompt = systemPromptSetting?.setting_value?.prompt || 
      'You are InfoNiblet, a friendly AI research assistant. Keep answers concise and include sources.';
    
    const modelSetting = settings?.find(s => s.setting_key === 'openrouter_model');
    const aiModel = modelSetting?.setting_value?.model || 'nvidia/nemotron-nano-12b-v2-vl:free';

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
      const executionResult = await executeWithSpecializedModel(
        openRouterApiKey,
        supabaseUrl,
        taskIntent,
        message_content,
        conversationHistory,
        systemPrompt
      );
      
      aiResponse = executionResult.response;
      selectedModel = executionResult.model;
      toolCalls = executionResult.toolCalls;
    }

    // Store AI response
    await supabase.from('whatsapp_messages').insert({
      phone_number,
      sender: 'assistant',
      message_type: 'text',
      message_content: aiResponse,
      ai_response: aiResponse,
      intent: taskIntent,
      tool_calls: toolCalls,
      model_used: selectedModel,
    });

    // Send response via Meta API
    await sendWhatsAppMessage(whatsappPhoneNumberId, whatsappAccessToken, phone_number, aiResponse);

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 200, // Return 200 to prevent Meta from retrying
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

// Execute task with specialized model
async function executeWithSpecializedModel(
  apiKey: string,
  supabaseUrl: string,
  intent: TaskIntent,
  message: string,
  history: any[],
  systemPrompt: string
): Promise<{ response: string; model: string; toolCalls?: any }> {
  
  let selectedModel = MODEL_REGISTRY.general_chat;
  let specializedSystemPrompt = systemPrompt;
  
  switch (intent) {
    case 'web_search':
      selectedModel = MODEL_REGISTRY.web_search;
      specializedSystemPrompt = `${systemPrompt}\n\nProvide current, factual information. Be concise and helpful.`;
      break;
    case 'reasoning':
      selectedModel = MODEL_REGISTRY.heavy_reasoning;
      specializedSystemPrompt = `${systemPrompt}\n\nThink step-by-step. Break down complex problems logically.`;
      break;
    case 'planning':
      selectedModel = MODEL_REGISTRY.planning;
      specializedSystemPrompt = `${systemPrompt}\n\nCreate structured, detailed plans with clear steps.`;
      break;
    default:
      selectedModel = MODEL_REGISTRY.general_chat;
      specializedSystemPrompt = `${systemPrompt}\n\nBe friendly, concise, and helpful.`;
      break;
  }
  
  console.log(`Executing with ${intent} using model: ${selectedModel}`);
  
  const recentHistory = history.slice(-10);
  const messages = [
    { role: 'system', content: specializedSystemPrompt },
    ...recentHistory,
    { role: 'user', content: message }
  ];
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': supabaseUrl,
        'X-Title': 'InfoNiblet Bot',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: intent === 'reasoning' || intent === 'planning' ? 0.3 : 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Model error:', response.status, errorText);
      
      if (response.status === 429 && selectedModel !== MODEL_REGISTRY.fallback) {
        console.log('Rate limited, trying fallback');
        
        const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': supabaseUrl,
            'X-Title': 'InfoNiblet Bot',
          },
          body: JSON.stringify({
            model: MODEL_REGISTRY.fallback,
            messages,
            temperature: 0.7,
          }),
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          return {
            response: fallbackData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.',
            model: MODEL_REGISTRY.fallback,
          };
        }
      }
      
      if (response.status === 429) {
        return { response: '⏱️ Service busy. Please try again shortly.', model: selectedModel };
      }
      return { response: '❌ Error occurred. Please try again.', model: selectedModel };
    }

    const data = await response.json();
    return {
      response: data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.',
      model: selectedModel,
    };
    
  } catch (error) {
    console.error('Execution error:', error);
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
