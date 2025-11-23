import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Phone, User, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Message {
  id: string;
  phone_number: string;
  sender: 'user' | 'assistant';
  message_content: string;
  ai_response?: string;
  intent?: string;
  received_at: string;
}

export const MessagesView = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        () => loadMessages()
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
    }
    setLoading(false);
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
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Contacts
          </CardTitle>
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
                
                return (
                  <button
                    key={phone}
                    onClick={() => setSelectedPhone(phone)}
                    className={`w-full text-left p-3 rounded-lg transition-smooth hover:bg-muted/50 ${
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
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lastMessage.received_at), { addSuffix: true })}
                    </div>
                  </button>
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
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.sender === 'assistant' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className={message.sender === 'user' ? 'bg-secondary' : 'bg-gradient-primary'}>
                      {message.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-white" />}
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
                    </div>
                    
                    <div
                      className={`px-4 py-2 rounded-xl max-w-[80%] ${
                        message.sender === 'user'
                          ? 'bg-muted'
                          : 'bg-gradient-primary text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {message.sender === 'user' ? message.message_content : message.ai_response}
                      </p>
                    </div>
                    
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(message.received_at), { addSuffix: true })}
                    </span>
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
