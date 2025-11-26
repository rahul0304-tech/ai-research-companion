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
  general_chat: 'deepseek/deepseek-chat-v3-0324:free', // Reliable, good uptime
  heavy_reasoning: 'deepseek/deepseek-r1:free', // Excellent reasoning
  web_search: 'deepseek/deepseek-chat-v3-0324:free', // Good for current info
  planning: 'deepseek/deepseek-r1:free', // Best for structured thinking
  fallback: 'nvidia/nemotron-nano-12b-v2-vl:free' // Ultra-reliable fallback
};

type TaskIntent = 'general_question' | 'web_search' | 'reasoning' | 'planning' | 'subscribe' | 'unsubscribe' | 'request_update';

serve(async (req) => {
  // Log all incoming requests
  console.log('Webhook called:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET requests (Twilio webhook validation)
  if (req.method === 'GET') {
    console.log('GET request received - webhook validation');
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'whatsapp-webhook',
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Only process POST requests for messages
  if (req.method !== 'POST') {
    console.log('Unsupported method:', req.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST for messages or GET for validation.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse incoming webhook - support both Twilio and Meta formats
    let phone_number = '';
    let message_content = '';
    let message_id = '';
    
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const body = await req.json();
      
      // Meta/WhatsApp Business API format
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        phone_number = msg.from;
        message_content = msg.text?.body || msg.caption || '';
        message_id = msg.id;
      } else {
        // Generic JSON format
        phone_number = body.phone_number || body.From || '';
        message_content = body.message || body.Body || '';
        message_id = body.message_id || '';
      }
    } else {
      // Twilio form-urlencoded format
      const formData = await req.formData();
      phone_number = formData.get('From') as string || '';
      message_content = formData.get('Body') as string || '';
      message_id = formData.get('MessageSid') as string || '';
    }

    console.log('Parsed message data:', { phone_number, message_content, message_id });

    // Validate required data
    if (!phone_number || !message_content) {
      console.error('Missing required data:', { phone_number: !!phone_number, message_content: !!message_content });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          details: 'phone_number and message_content are required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Valid message received:', { phone_number, message_content, message_id });

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

    // Use rule-based classification (no API call needed)
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
      // Execute task with specialized model
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

    // Store AI response with model tracking
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

    // Return response in TwiML format for Twilio or simple JSON
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(aiResponse)}</Message>
</Response>`;

    return new Response(twimlResponse, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Return TwiML error response for compatibility
    const twimlError = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message: ${escapeXml(errorMessage)}</Message>
</Response>`;
    
    return new Response(twimlError, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});

// Helper functions

// Rule-based intent classification (no API calls, instant response)
function classifyTaskIntent(message: string, history: any[]): TaskIntent {
  const lower = message.toLowerCase();
  
  // System commands
  if (lower.includes('subscribe') || lower.includes('sign up') || lower === '3') {
    return 'subscribe';
  }
  if (lower.includes('unsubscribe') || lower.includes('stop') || lower.includes('cancel')) {
    return 'unsubscribe';
  }
  if (lower.includes('latest') || lower.includes('update') || lower.includes('news') || lower === '1') {
    return 'request_update';
  }
  
  // Web search indicators
  if (
    lower.includes('hotel') || lower.includes('restaurant') || lower.includes('weather') ||
    lower.includes('current') || lower.includes('today') || lower.includes('now') ||
    lower.includes('search for') || lower.includes('find me') || lower.includes('where can i')
  ) {
    return 'web_search';
  }
  
  // Planning indicators
  if (
    lower.includes('plan') || lower.includes('itinerary') || lower.includes('schedule') ||
    lower.includes('create a') && (lower.includes('trip') || lower.includes('roadmap')) ||
    lower.includes('step by step')
  ) {
    return 'planning';
  }
  
  // Reasoning indicators
  if (
    lower.includes('calculate') || lower.includes('solve') || lower.includes('analyze') ||
    lower.includes('compare') || lower.includes('why') && lower.includes('how') ||
    lower.includes('explain') && lower.includes('detail')
  ) {
    return 'reasoning';
  }
  
  // Default to general question
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
  
  // Select model based on intent
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
      specializedSystemPrompt = `${systemPrompt}\n\nCreate structured, detailed plans with clear steps. Be organized and thorough.`;
      break;
    
    case 'general_question':
    default:
      selectedModel = MODEL_REGISTRY.general_chat;
      specializedSystemPrompt = `${systemPrompt}\n\nBe friendly, concise, and helpful. Keep answers under 200 words unless asked for detail.`;
      break;
  }
  
  console.log(`Executing with ${intent} using model: ${selectedModel}`);
  
  // Build optimized context (last 10 messages to stay within token limits)
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
        'X-Title': 'InfoNiblet Multi-Modal Bot',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: intent === 'reasoning' || intent === 'planning' ? 0.3 : 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Model execution error:', response.status, errorText);
      
      // If rate limited, try fallback model
      if (response.status === 429 && selectedModel !== MODEL_REGISTRY.fallback) {
        console.log('Rate limited, trying fallback model:', MODEL_REGISTRY.fallback);
        
        const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': supabaseUrl,
            'X-Title': 'InfoNiblet Multi-Modal Bot',
          },
          body: JSON.stringify({
            model: MODEL_REGISTRY.fallback,
            messages,
            temperature: 0.7,
          }),
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const fallbackAiResponse = fallbackData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
          return {
            response: fallbackAiResponse,
            model: MODEL_REGISTRY.fallback,
            toolCalls: null
          };
        }
      }
      
      if (response.status === 429) {
        return { response: '⏱️ All models are temporarily busy. Please try again in a moment.', model: selectedModel };
      } else if (response.status === 402) {
        return { response: '💳 API credits exhausted. Please contact admin.', model: selectedModel };
      } else {
        return { response: '❌ Sorry, I encountered an error. Please try again.', model: selectedModel };
      }
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    
    return {
      response: aiResponse,
      model: selectedModel,
      toolCalls: null
    };
    
  } catch (error) {
    console.error('Execution error:', error);
    return {
      response: '❌ An error occurred while processing your request.',
      model: selectedModel
    };
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
        : '✅ Subscribed! You\'ll get AI news updates every 6 hours. Reply STOP to unsubscribe.'
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
        : '👋 You\'ve been unsubscribed. Reply SUBSCRIBE to start receiving updates again.'
    };
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
