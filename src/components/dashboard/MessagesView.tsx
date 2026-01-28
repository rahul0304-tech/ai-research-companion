import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Phone, User, Bot, Trash2, Clock, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Message {
  id: string;
  phone_number: string;
  sender: 'user' | 'assistant';
  message_content: string;
  ai_response?: string;
  intent?: string;
  received_at: string;
  model_used?: string;
  ai_latency_ms?: number;
  total_latency_ms?: number;
  processing_status?: string;
}

export const MessagesView = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [processingMessages, setProcessingMessages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMessages();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          // Track processing messages for "thinking" indicator
          if (payload.eventType === 'INSERT' && payload.new) {
            const newMsg = payload.new as Message;
            if (newMsg.processing_status === 'processing') {
              setProcessingMessages(prev => new Set(prev).add(newMsg.phone_number));
            }
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedMsg = payload.new as Message;
            if (updatedMsg.processing_status === 'completed' || updatedMsg.processing_status === 'sent') {
              setProcessingMessages(prev => {
                const next = new Set(prev);
                next.delete(updatedMsg.phone_number);
                return next;
              });
            }
          }
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      setMessages((data || []) as Message[]);
      
      // Update processing messages set
      const processing = new Set<string>();
      (data || []).forEach((m: any) => {
        if (m.processing_status === 'processing') {
          processing.add(m.phone_number);
        }
      });
      setProcessingMessages(processing);
    }
    setLoading(false);
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase
      .from('whatsapp_messages')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete message');
      console.error('Delete error:', error);
    } else {
      toast.success('Message deleted');
      setMessages(prev => prev.filter(m => m.id !== id));
    }
  };

  const clearConversation = async (phoneNumber: string) => {
    const { error } = await supabase
      .from('whatsapp_messages')
      .delete()
      .eq('phone_number', phoneNumber);
    
    if (error) {
      toast.error('Failed to clear conversation');
      console.error('Clear error:', error);
    } else {
      toast.success('Conversation cleared');
      setMessages(prev => prev.filter(m => m.phone_number !== phoneNumber));
      if (selectedPhone === phoneNumber) {
        setSelectedPhone(null);
      }
    }
  };

  const clearAllMessages = async () => {
    const { error } = await supabase
      .from('whatsapp_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error) {
      toast.error('Failed to clear all messages');
      console.error('Clear all error:', error);
    } else {
      toast.success('All messages cleared');
      setMessages([]);
      setSelectedPhone(null);
    }
  };

  const uniquePhoneNumbers = Array.from(new Set(messages.map(m => m.phone_number)));
  
  const filteredMessages = selectedPhone
    ? messages.filter(m => m.phone_number === selectedPhone)
    : messages;

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
    <div className="grid lg:grid-cols-[300px_1fr] gap-4">
      {/* Contacts sidebar */}
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Contacts
            </CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all messages?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all messages from all conversations.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAllMessages} className="bg-destructive text-destructive-foreground">
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <CardDescription>{uniquePhoneNumbers.length} active conversations</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="space-y-1 p-4">
              <button
                onClick={() => setSelectedPhone(null)}
                className={`w-full text-left p-3 rounded-lg transition-smooth hover:bg-muted/50 ${
                  !selectedPhone ? 'bg-primary/10 border border-primary/20' : ''
                }`}
              >
                <div className="font-medium text-sm">All Messages</div>
                <div className="text-xs text-muted-foreground">{messages.length} total</div>
              </button>
              
              {uniquePhoneNumbers.map(phone => {
                const phoneMessages = messages.filter(m => m.phone_number === phone);
                const lastMessage = phoneMessages[0];
                const isProcessing = processingMessages.has(phone);
                
                return (
                  <div key={phone} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedPhone(phone)}
                      className={`flex-1 text-left p-3 rounded-lg transition-smooth hover:bg-muted/50 ${
                        selectedPhone === phone ? 'bg-primary/10 border border-primary/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-xs bg-primary/20">
                            {phone.slice(-2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium text-sm truncate flex-1">{phone}</div>
                        {isProcessing && (
                          <div className="flex items-center gap-1 text-xs text-primary animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lastMessage.received_at), { addSuffix: true })}
                      </div>
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete all messages with {phone}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => clearConversation(phone)} className="bg-destructive text-destructive-foreground">
                            Clear
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            {selectedPhone ? `Conversation with ${selectedPhone}` : 'All Messages'}
          </CardTitle>
          <CardDescription>
            {filteredMessages.length} messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {/* AI Thinking indicator */}
              {selectedPhone && processingMessages.has(selectedPhone) && (
                <div className="flex gap-3 flex-row-reverse">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-primary">
                      <Bot className="w-4 h-4 text-black" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 items-end flex flex-col gap-1">
                    <div className="px-4 py-3 rounded-xl bg-gradient-primary text-black">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className={`group flex gap-3 ${
                    message.sender === 'assistant' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className={message.sender === 'user' ? 'bg-secondary' : 'bg-gradient-primary'}>
                      {message.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-black" />}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className={`flex-1 ${message.sender === 'assistant' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {message.sender === 'user' ? 'User' : 'Assistant'}
                      </span>
                      {message.intent && (
                        <Badge variant="secondary" className="text-xs">
                          {message.intent}
                        </Badge>
                      )}
                      {/* Latency badges for assistant messages */}
                      {message.sender === 'assistant' && message.ai_latency_ms && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Zap className="w-3 h-3" />
                          AI: {message.ai_latency_ms}ms
                        </Badge>
                      )}
                      {message.sender === 'assistant' && message.total_latency_ms && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="w-3 h-3" />
                          Total: {message.total_latency_ms}ms
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMessage(message.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    <div
                      className={`px-4 py-2 rounded-xl max-w-[80%] ${
                        message.sender === 'user'
                          ? 'bg-muted'
                          : 'bg-gradient-primary text-black'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {message.sender === 'user' ? message.message_content : message.ai_response}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(message.received_at), { addSuffix: true })}
                      </span>
                      {message.model_used && message.model_used !== 'system' && (
                        <span className="opacity-50">• {message.model_used}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
