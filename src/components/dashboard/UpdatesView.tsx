import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Calendar, ExternalLink, Plus } from "lucide-react";
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

export const UpdatesView = () => {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleCreateUpdate = async () => {
    const newUpdate = {
      title: 'Sample AI Research Update',
      summary: 'This is a sample update. Edit it to add real research content.',
      full_content: 'Extended content goes here...',
      category: 'general',
      scheduled_for: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
      status: 'pending' as const,
    };

    const { error } = await supabase
      .from('ai_updates')
      .insert(newUpdate);

    if (error) {
      console.error('Error creating update:', error);
      toast.error('Failed to create update');
    } else {
      toast.success('Update created successfully');
      loadUpdates();
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
            <Button onClick={handleCreateUpdate} className="bg-gradient-primary text-white shadow-glow transition-smooth hover:shadow-lg">
              <Plus className="w-4 h-4 mr-2" />
              New Update
            </Button>
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
