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
}

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
    const aiModel = modelSetting?.setting_value?.model || 'openai/gpt-4o';

    // Classify intent
    const intent = await classifyIntent(message_content);
    
    console.log('Classified intent:', intent);

    // Handle different intents
    let aiResponse = '';
    let toolCalls: any = null;

    if (intent === 'subscribe') {
      const result = await handleSubscription(supabase, phone_number, 'subscribe');
      aiResponse = result.message;
    } else if (intent === 'unsubscribe') {
      const result = await handleSubscription(supabase, phone_number, 'unsubscribe');
      aiResponse = result.message;
    } else if (intent === 'request_update') {
      // Get latest AI updates from database
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
    } else if (intent === 'qa') {
      // Enhanced AI for Q&A with current info awareness
      const enhancedSystemPrompt = `${systemPrompt}

IMPORTANT: You have access to information up to April 2024. When answering:
1. For questions about current events after April 2024, acknowledge the limitation but provide context
2. For general knowledge, technical questions, and historical information - answer confidently
3. Always cite sources with [1], [2] notation when possible
4. Keep answers concise and accurate
5. If asked about very recent events, explain your knowledge cutoff

Be helpful and informative while being transparent about limitations.`;

      const messages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message_content }
      ];

      console.log('Calling OpenRouter API for Q&A with model:', aiModel);

      const aiApiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': supabaseUrl,
          'X-Title': 'InfoNiblet WhatsApp Bot',
        },
        body: JSON.stringify({
          model: aiModel,
          messages,
        }),
      });

      if (!aiApiResponse.ok) {
        const errorText = await aiApiResponse.text();
        console.error('AI API error:', aiApiResponse.status, errorText);
        
        if (aiApiResponse.status === 429) {
          aiResponse = '⏱️ Rate limit exceeded. Please try again in a moment.';
        } else if (aiApiResponse.status === 402) {
          aiResponse = '❌ Service temporarily unavailable. Please contact support.';
        } else {
          aiResponse = '❌ Sorry, I encountered an error. Please try again.';
        }
      } else {
        const aiData = await aiApiResponse.json();
        aiResponse = aiData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
        console.log('AI response generated successfully');
      }
    } else {
      aiResponse = "I'm not sure how to help with that. Try:\n1️⃣ Latest updates\n2️⃣ Ask a question\n3️⃣ Subscribe";
    }

    // Store AI response
    await supabase.from('whatsapp_messages').insert({
      phone_number,
      sender: 'assistant',
      message_type: 'text',
      message_content: aiResponse,
      ai_response: aiResponse,
      intent,
      tool_calls: toolCalls,
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
function classifyIntent(message: string): string {
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
  if (lower.includes('?') || lower.includes('what') || lower.includes('how') || lower.includes('why') || lower === '2') {
    return 'qa';
  }
  
  return 'qa'; // Default to QA
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
