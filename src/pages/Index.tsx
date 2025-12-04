import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, MessageSquare, Zap, Clock, ArrowRight, Bot } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
const Index = () => {
  return <div className="min-h-screen bg-gradient-subtle">
      {/* Header with theme toggle */}
      <header className="absolute top-0 right-0 z-20 p-4">
        <ThemeToggle />
      </header>
      
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-primary opacity-5"></div>
        <div className="container mx-auto px-4 py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary font-medium mb-4 animate-in fade-in slide-in-from-bottom-3 duration-700">
              <Sparkles className="w-4 h-4" />
              AI-Powered Research Assistant
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              Meet <span className="gradient-primary bg-clip-text text-transparent">InfoNiblet</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
              Your professional AI research assistant delivering curated insights via WhatsApp
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
              <Link to="/dashboard">
                <Button size="lg" className="bg-gradient-primary text-white shadow-glow transition-smooth hover:shadow-lg px-8 py-6 text-lg font-semibold">
                  Open Dashboard
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="px-8 py-6 text-lg font-semibold border-2">
                Learn More
              </Button>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-1/4 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            How InfoNiblet Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Intelligent AI research delivered right to your phone
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow mb-4">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">WhatsApp Integration</CardTitle>
              <CardDescription>
                Chat naturally with InfoNiblet via WhatsApp. Ask questions, get answers with sources.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-accent flex items-center justify-center shadow-glow mb-4">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">Scheduled Updates</CardTitle>
              <CardDescription>
                Receive curated AI research updates every 6 hours automatically.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">Smart Retrieval</CardTitle>
              <CardDescription>
                Powered by arXiv, Semantic Scholar, and other research databases for accurate information.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-accent flex items-center justify-center shadow-glow mb-4">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">AI-Powered</CardTitle>
              <CardDescription>
                Uses advanced language models to understand context and provide relevant insights.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">Image Generation</CardTitle>
              <CardDescription>
                Visualize concepts with AI-generated diagrams and illustrations on demand.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm transition-smooth hover:shadow-lg hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-accent flex items-center justify-center shadow-glow mb-4">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl">Conversational</CardTitle>
              <CardDescription>
                Natural conversation flow with context awareness and follow-up questions.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="border-border/50 shadow-lg bg-gradient-primary text-white max-w-4xl mx-auto">
          <CardContent className="p-12 text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">
              Ready to Transform Your Research?
            </h2>
            <p className="text-lg opacity-90 max-w-2xl mx-auto">
              Start managing your AI research assistant and subscribers through the dashboard
            </p>
            <Link to="/dashboard">
              <Button size="lg" variant="secondary" className="px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-smooth">
                Access Dashboard
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p className="text-sm">
            © 2025 InfoNiblet. AI Research Assistant powered by Lovable Cloud.
          </p>
        </div>
      </footer>
    </div>;
};
export default Index;