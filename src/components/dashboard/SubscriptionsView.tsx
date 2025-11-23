import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Phone, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Subscription {
  id: string;
  phone_number: string;
  subscribed_at: string;
  preferences?: any;
  active: boolean;
}

export const SubscriptionsView = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    loadSubscriptions();
    
    const channel = supabase
      .channel('subscriptions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => loadSubscriptions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSubscriptions = async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('subscribed_at', { ascending: false });

    if (error) {
      console.error('Error loading subscriptions:', error);
      toast.error('Failed to load subscriptions');
    } else {
      setSubscriptions(data || []);
    }
    setLoading(false);
  };

  const handleAddSubscription = async () => {
    if (!newPhone.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    const { error } = await supabase
      .from('subscriptions')
      .insert({ phone_number: newPhone, active: true });

    if (error) {
      console.error('Error adding subscription:', error);
      toast.error('Failed to add subscription');
    } else {
      toast.success('Subscription added successfully');
      setNewPhone('');
      loadSubscriptions();
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('subscriptions')
      .update({ active: !currentActive })
      .eq('id', id);

    if (error) {
      console.error('Error updating subscription:', error);
      toast.error('Failed to update subscription');
    } else {
      toast.success(currentActive ? 'Subscription deactivated' : 'Subscription activated');
      loadSubscriptions();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting subscription:', error);
      toast.error('Failed to delete subscription');
    } else {
      toast.success('Subscription deleted');
      loadSubscriptions();
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

  const activeCount = subscriptions.filter(s => s.active).length;

  return (
    <div className="space-y-4">
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Subscriptions
          </CardTitle>
          <CardDescription>
            {activeCount} active out of {subscriptions.length} total subscribers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input
              placeholder="Enter phone number (e.g., +1234567890)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSubscription()}
            />
            <Button onClick={handleAddSubscription} className="bg-gradient-primary text-white shadow-glow">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>

          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-2">
              {subscriptions.map((sub) => (
                <Card key={sub.id} className="border-border/50 bg-background/50 transition-smooth hover:shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{sub.phone_number}</div>
                          <div className="text-xs text-muted-foreground">
                            Subscribed {format(new Date(sub.subscribed_at), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.active ? 'default' : 'secondary'}>
                          {sub.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(sub.id, sub.active)}
                        >
                          {sub.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(sub.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {subscriptions.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No subscriptions yet</p>
                  <p className="text-sm mt-2">Add your first subscriber to get started</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
