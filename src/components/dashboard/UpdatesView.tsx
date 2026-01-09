import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Sparkles, Calendar, ExternalLink, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface AIUpdate {
  id: string;
  title: string;
  summary: string;
  full_content?: string;
  sources?: any;
  category?: string;
  scheduled_for: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'failed';
  created_at: string;
}

interface UpdateFormData {
  title: string;
  summary: string;
  full_content: string;
  category: string;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed';
}

const defaultFormData: UpdateFormData = {
  title: '',
  summary: '',
  full_content: '',
  category: 'general',
  scheduled_for: '',
  status: 'pending',
};

export const UpdatesView = () => {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<AIUpdate | null>(null);
  const [formData, setFormData] = useState<UpdateFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUpdates();
    
    const channel = supabase
      .channel('updates-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_updates' },
        () => loadUpdates()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadUpdates = async () => {
    const { data, error } = await supabase
      .from('ai_updates')
      .select('*')
      .order('scheduled_for', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading updates:', error);
      toast.error('Failed to load updates');
    } else {
      setUpdates((data || []) as AIUpdate[]);
    }
    setLoading(false);
  };

  const handleOpenCreate = () => {
    setEditingUpdate(null);
    const defaultDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    setFormData({
      ...defaultFormData,
      scheduled_for: format(defaultDate, "yyyy-MM-dd'T'HH:mm"),
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (update: AIUpdate) => {
    setEditingUpdate(update);
    setFormData({
      title: update.title,
      summary: update.summary,
      full_content: update.full_content || '',
      category: update.category || 'general',
      scheduled_for: format(new Date(update.scheduled_for), "yyyy-MM-dd'T'HH:mm"),
      status: update.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.summary.trim()) {
      toast.error('Title and summary are required');
      return;
    }

    setSaving(true);

    const updateData = {
      title: formData.title.trim(),
      summary: formData.summary.trim(),
      full_content: formData.full_content.trim() || null,
      category: formData.category || null,
      scheduled_for: new Date(formData.scheduled_for).toISOString(),
      status: formData.status,
    };

    if (editingUpdate) {
      const { error } = await supabase
        .from('ai_updates')
        .update(updateData)
        .eq('id', editingUpdate.id);

      if (error) {
        console.error('Error updating:', error);
        toast.error('Failed to update');
      } else {
        toast.success('Update saved successfully');
        setDialogOpen(false);
      }
    } else {
      const { error } = await supabase
        .from('ai_updates')
        .insert([updateData as any]);

      if (error) {
        console.error('Error creating update:', error);
        toast.error('Failed to create update');
      } else {
        toast.success('Update created successfully');
        setDialogOpen(false);
      }
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('ai_updates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete update');
    } else {
      toast.success('Update deleted');
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
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Research Updates
              </CardTitle>
              <CardDescription>{updates.length} scheduled updates</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleOpenCreate} className="bg-gradient-primary text-white shadow-glow transition-smooth hover:shadow-lg">
                  <Plus className="w-4 h-4 mr-2" />
                  New Update
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingUpdate ? 'Edit Update' : 'Create New Update'}</DialogTitle>
                  <DialogDescription>
                    {editingUpdate ? 'Modify the update details below' : 'Enter the details for your AI research update'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      placeholder="Enter update title..."
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="summary">Summary / Prompt Instructions *</Label>
                    <Textarea
                      id="summary"
                      placeholder="Enter the summary or prompt instructions for AI to generate content..."
                      className="min-h-[100px]"
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      This can be a direct summary or instructions for AI to research and generate content at the scheduled time.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="full_content">Full Content (Optional)</Label>
                    <Textarea
                      id="full_content"
                      placeholder="Enter extended content or leave empty for AI to generate..."
                      className="min-h-[120px]"
                      value={formData.full_content}
                      onChange={(e) => setFormData({ ...formData, full_content: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="science">Science</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="health">Health</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="ai">AI & ML</SelectItem>
                          <SelectItem value="crypto">Crypto & Web3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value: 'pending' | 'sent' | 'failed') => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduled_for">Scheduled For</Label>
                    <Input
                      id="scheduled_for"
                      type="datetime-local"
                      value={formData.scheduled_for}
                      onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving}>
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {editingUpdate ? 'Save Changes' : 'Create Update'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {updates.map((update) => (
                <Card key={update.id} className="border-border/50 bg-background/50 transition-smooth hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-base mb-2">{update.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              update.status === 'sent' ? 'default' :
                              update.status === 'failed' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {update.status}
                          </Badge>
                          {update.category && (
                            <Badge variant="outline">{update.category}</Badge>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(update.scheduled_for), 'MMM d, yyyy HH:mm')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(update)}
                          className="h-8 w-8"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Update</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{update.title}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(update.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-3">{update.summary}</p>
                    
                    {update.sources && Array.isArray(update.sources) && update.sources.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-foreground">Sources:</div>
                        {update.sources.slice(0, 3).map((source: any, idx: number) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {source.title || source.url}
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {updates.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No updates scheduled yet</p>
                  <p className="text-sm mt-2">Create your first research update to get started</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
