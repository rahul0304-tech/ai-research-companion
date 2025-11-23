import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessagesView } from "@/components/dashboard/MessagesView";
import { UpdatesView } from "@/components/dashboard/UpdatesView";
import { SubscriptionsView } from "@/components/dashboard/SubscriptionsView";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { MessageSquare, Sparkles, Users, Settings } from "lucide-react";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("messages");

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">InfoNiblet</h1>
              <p className="text-sm text-muted-foreground">AI Research Assistant Dashboard</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 mb-8 bg-card/50 backdrop-blur-sm p-1 rounded-xl border border-border/50">
            <TabsTrigger 
              value="messages" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white transition-smooth"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger 
              value="updates"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white transition-smooth"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Updates</span>
            </TabsTrigger>
            <TabsTrigger 
              value="subscriptions"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white transition-smooth"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Subscribers</span>
            </TabsTrigger>
            <TabsTrigger 
              value="settings"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white transition-smooth"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messages" className="space-y-4">
            <MessagesView />
          </TabsContent>

          <TabsContent value="updates" className="space-y-4">
            <UpdatesView />
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <SubscriptionsView />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SettingsView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
