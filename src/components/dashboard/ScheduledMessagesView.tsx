import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Calendar, Clock, Plus, Trash2, Send, Bot, CheckCircle, XCircle, RefreshCw, Repeat, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ScheduledMessage {
  id: string;
  phone_number: string;
  message_content: string;
  task_prompt: string | null;
  prompt_instructions: string | null;
  scheduled_for: string;
  status: string;
  sent_at: string | null;
  ai_response: string | null;
  model_used: string | null;
  created_at: string;
  recurrence_type: string;
  recurrence_interval: number | null;
  recurrence_end_date: string | null;
  next_run_at: string | null;
}

interface Subscription {
  phone_number: string;
  active: boolean;
}

type RecurrenceType = 'once' | 'daily' | 'weekly' | 'every_x_hours' | 'every_x_days' | 'date_range';

export const ScheduledMessagesView = () => {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [messageType, setMessageType] = useState<'direct' | 'ai_task'>('direct');
  const [messageContent, setMessageContent] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [promptInstructions, setPromptInstructions] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('once');
  const [recurrenceInterval, setRecurrenceInterval] = useState('1');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  useEffect(() => {
    loadData();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('scheduled-messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_messages'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => [...prev, payload.new as ScheduledMessage].sort(
              (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
            ));
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(msg => 
              msg.id === payload.new.id ? payload.new as ScheduledMessage : msg
            ));
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    const [messagesRes, subsRes] = await Promise.all([
      supabase
        .from('scheduled_messages')
        .select('*')
        .order('scheduled_for', { ascending: true }),
      supabase
        .from('subscriptions')
        .select('phone_number, active')
        .eq('active', true)
    ]);
    
    if (messagesRes.error) {
      console.error('Error loading scheduled messages:', messagesRes.error);
      toast.error('Failed to load scheduled messages');
    } else {
      setMessages(messagesRes.data || []);
    }
    
    if (subsRes.data) {
      setSubscriptions(subsRes.data);
    }
    
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!phoneNumber || !scheduledDate || !scheduledTime) {
      toast.error('Please fill in required fields');
      return;
    }
    
    if (messageType === 'direct' && !messageContent) {
      toast.error('Please enter a message');
      return;
    }
    
    if (messageType === 'ai_task' && !taskPrompt) {
      toast.error('Please enter an AI task prompt');
      return;
    }
    
    if ((recurrenceType === 'every_x_hours' || recurrenceType === 'every_x_days') && !recurrenceInterval) {
      toast.error('Please enter a recurrence interval');
      return;
    }
    
    setCreating(true);
    
    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    const insertData: Record<string, unknown> = {
      phone_number: phoneNumber,
      message_content: messageType === 'direct' ? messageContent : `[AI Task] ${taskPrompt}`,
      task_prompt: messageType === 'ai_task' ? taskPrompt : null,
      prompt_instructions: messageType === 'ai_task' ? promptInstructions || null : null,
      scheduled_for: scheduledFor,
      status: 'pending',
      recurrence_type: recurrenceType,
      recurrence_interval: ['every_x_hours', 'every_x_days'].includes(recurrenceType) ? parseInt(recurrenceInterval) : null,
      recurrence_end_date: recurrenceType === 'date_range' && recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : null,
      next_run_at: scheduledFor
    };
    
    const { error } = await supabase.from('scheduled_messages').insert([insertData as any]);
    
    if (error) {
      console.error('Error creating scheduled message:', error);
      toast.error('Failed to schedule message');
    } else {
      toast.success('Message scheduled successfully');
      setShowForm(false);
      resetForm();
    }
    
    setCreating(false);
  };

  const resetForm = () => {
    setEditingMessage(null);
    setPhoneNumber('');
    setMessageType('direct');
    setMessageContent('');
    setTaskPrompt('');
    setPromptInstructions('');
    setScheduledDate('');
    setScheduledTime('');
    setRecurrenceType('once');
    setRecurrenceInterval('1');
    setRecurrenceEndDate('');
  };

  const handleEdit = (msg: ScheduledMessage) => {
    setEditingMessage(msg);
    setPhoneNumber(msg.phone_number);
    setMessageType(msg.task_prompt ? 'ai_task' : 'direct');
    setMessageContent(msg.task_prompt ? '' : msg.message_content);
    setTaskPrompt(msg.task_prompt || '');
    setPromptInstructions(msg.prompt_instructions || '');
    const scheduledFor = new Date(msg.scheduled_for);
    setScheduledDate(format(scheduledFor, 'yyyy-MM-dd'));
    setScheduledTime(format(scheduledFor, 'HH:mm'));
    setRecurrenceType(msg.recurrence_type as RecurrenceType);
    setRecurrenceInterval(msg.recurrence_interval?.toString() || '1');
    setRecurrenceEndDate(msg.recurrence_end_date ? format(new Date(msg.recurrence_end_date), 'yyyy-MM-dd') : '');
    setShowForm(true);
  };

  const handleUpdate = async () => {
    if (!editingMessage) return;
    
    if (!phoneNumber || !scheduledDate || !scheduledTime) {
      toast.error('Please fill in required fields');
      return;
    }
    
    setCreating(true);
    
    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    const updateData: Record<string, unknown> = {
      phone_number: phoneNumber,
      message_content: messageType === 'direct' ? messageContent : `[AI Task] ${taskPrompt}`,
      task_prompt: messageType === 'ai_task' ? taskPrompt : null,
      prompt_instructions: messageType === 'ai_task' ? promptInstructions || null : null,
      scheduled_for: scheduledFor,
      recurrence_type: recurrenceType,
      recurrence_interval: ['every_x_hours', 'every_x_days'].includes(recurrenceType) ? parseInt(recurrenceInterval) : null,
      recurrence_end_date: recurrenceType === 'date_range' && recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : null,
      next_run_at: scheduledFor
    };
    
    const { error } = await supabase
      .from('scheduled_messages')
      .update(updateData)
      .eq('id', editingMessage.id);
    
    if (error) {
      console.error('Error updating scheduled message:', error);
      toast.error('Failed to update message');
    } else {
      toast.success('Message updated successfully');
      setShowForm(false);
      resetForm();
      loadData();
    }
    
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    const prev = messages;
    setMessages((cur) => cur.filter((m) => m.id !== id));
    
    const { error } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', id);
    
    if (error) {
      setMessages(prev);
      toast.error('Failed to delete message');
    } else {
      toast.success('Message deleted');
    }
  };

  const handleManualTrigger = async () => {
    setTriggering(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-scheduled`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          }
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        toast.success(`Processed ${result.processed || 0} message(s)`);
      } else {
        toast.error('Failed to trigger scheduled messages');
      }
    } catch (error) {
      console.error('Error triggering:', error);
      toast.error('Failed to trigger scheduled messages');
    }
    setTriggering(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRecurrenceBadge = (type: string, interval: number | null) => {
    switch (type) {
      case 'once':
        return null;
      case 'daily':
        return <Badge variant="secondary" className="text-xs"><Repeat className="w-3 h-3 mr-1" />Daily</Badge>;
      case 'weekly':
        return <Badge variant="secondary" className="text-xs"><Repeat className="w-3 h-3 mr-1" />Weekly</Badge>;
      case 'every_x_hours':
        return <Badge variant="secondary" className="text-xs"><Repeat className="w-3 h-3 mr-1" />Every {interval}h</Badge>;
      case 'every_x_days':
        return <Badge variant="secondary" className="text-xs"><Repeat className="w-3 h-3 mr-1" />Every {interval}d</Badge>;
      case 'date_range':
        return <Badge variant="secondary" className="text-xs"><Repeat className="w-3 h-3 mr-1" />Date Range</Badge>;
      default:
        return null;
    }
  };

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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Scheduled Messages</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleManualTrigger} 
            disabled={triggering}
          >
            {triggering ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Process Now
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(!showForm); }} className="bg-gradient-primary">
            <Plus className="w-4 h-4 mr-2" />
            Schedule Message
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              {editingMessage ? 'Edit Scheduled Message' : 'Schedule New Message'}
            </CardTitle>
            <CardDescription>
              {editingMessage ? 'Update the scheduled message details' : 'Schedule a direct message or AI-generated response with recurrence options'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number (with country code)</Label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g., 916303175715 or 14155552671"
                />
                <p className="text-xs text-muted-foreground">
                  Include country code without + sign (e.g., 91 for India, 1 for USA)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Message Type</Label>
                <Select value={messageType} onValueChange={(v) => setMessageType(v as 'direct' | 'ai_task')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">
                      <div className="flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        Direct Message
                      </div>
                    </SelectItem>
                    <SelectItem value="ai_task">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        AI Task
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="daily">Every Day</SelectItem>
                    <SelectItem value="weekly">Every Week</SelectItem>
                    <SelectItem value="every_x_hours">Every X Hours</SelectItem>
                    <SelectItem value="every_x_days">Every X Days</SelectItem>
                    <SelectItem value="date_range">Date Range (Daily)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(recurrenceType === 'every_x_hours' || recurrenceType === 'every_x_days') && (
                <div className="space-y-2">
                  <Label>Interval ({recurrenceType === 'every_x_hours' ? 'hours' : 'days'})</Label>
                  <Input
                    type="number"
                    min="1"
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value)}
                    placeholder={recurrenceType === 'every_x_hours' ? 'e.g., 6' : 'e.g., 3'}
                  />
                </div>
              )}

              {recurrenceType === 'date_range' && (
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    min={scheduledDate || new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}
            </div>

            {messageType === 'direct' ? (
              <div className="space-y-2">
                <Label>Message Content</Label>
                <Textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Enter the message to send..."
                  className="min-h-[100px]"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>AI Task Prompt</Label>
                  <Textarea
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    placeholder="e.g., 'Summarize the latest AI news and send it as a briefing'"
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    The AI will execute this task freshly at each scheduled time.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Prompt Instructions (Optional)</Label>
                  <Textarea
                    value={promptInstructions}
                    onChange={(e) => setPromptInstructions(e.target.value)}
                    placeholder="e.g., 'Keep responses under 200 words. Use bullet points. Include sources.'"
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Additional instructions to guide how the AI should format or approach the task.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={editingMessage ? handleUpdate : handleCreate} 
                disabled={creating} 
                className="bg-gradient-primary"
              >
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                {editingMessage ? 'Update' : 'Schedule'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Scheduled Messages</CardTitle>
          <CardDescription>{messages.length} scheduled messages • Real-time updates enabled</CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled messages yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {msg.task_prompt ? (
                        <Badge variant="secondary" className="bg-primary/10">
                          <Bot className="w-3 h-3 mr-1" />
                          AI Task
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Send className="w-3 h-3 mr-1" />
                          Direct
                        </Badge>
                      )}
                      {getStatusBadge(msg.status)}
                      {getRecurrenceBadge(msg.recurrence_type, msg.recurrence_interval)}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => handleEdit(msg)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete scheduled message?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove this scheduled message.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(msg.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  
                  <p className="text-sm font-medium mb-1">{msg.phone_number}</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    {msg.task_prompt || msg.message_content}
                  </p>
                  
                  {msg.prompt_instructions && (
                    <p className="text-xs text-muted-foreground mb-2 italic">
                      Instructions: {msg.prompt_instructions}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(msg.scheduled_for), 'MMM d, yyyy h:mm a')}
                    </span>
                    {msg.next_run_at && msg.recurrence_type !== 'once' && msg.status === 'pending' && (
                      <span className="flex items-center gap-1 text-primary">
                        <RefreshCw className="w-3 h-3" />
                        Next: {format(new Date(msg.next_run_at), 'MMM d, h:mm a')}
                      </span>
                    )}
                    {msg.sent_at && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Sent {format(new Date(msg.sent_at), 'h:mm a')}
                      </span>
                    )}
                    {msg.model_used && (
                      <span className="text-primary">{msg.model_used}</span>
                    )}
                  </div>
                  
                  {msg.ai_response && msg.status === 'sent' && (
                    <div className="mt-2 p-2 bg-primary/5 rounded text-sm">
                      <p className="text-xs font-medium text-primary mb-1">AI Response:</p>
                      <p className="text-muted-foreground">{msg.ai_response.slice(0, 200)}...</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};