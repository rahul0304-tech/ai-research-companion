import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, DollarSign, Zap, TrendingUp } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  request_count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  date: string;
}

interface ProviderStats {
  provider: string;
  totalRequests: number;
  totalCost: number;
  models: { model: string; requests: number; cost: number }[];
}

// Cost estimates per 1M tokens (approximate)
const COST_ESTIMATES: Record<string, { input: number; output: number }> = {
  // Lovable AI (free tier)
  'google/gemini-2.5-flash-lite': { input: 0, output: 0 },
  'google/gemini-2.5-flash': { input: 0, output: 0 },
  'google/gemini-2.5-pro': { input: 0, output: 0 },
  'openai/gpt-5-nano': { input: 0, output: 0 },
  'openai/gpt-5-mini': { input: 0, output: 0 },
  'openai/gpt-5': { input: 0, output: 0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  // Gemini (direct)
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // OpenRouter free models
  'deepseek/deepseek-chat-v3-0324:free': { input: 0, output: 0 },
  'nvidia/nemotron-nano-12b-v2-vl:free': { input: 0, output: 0 },
  'google/gemini-2.0-flash-exp:free': { input: 0, output: 0 },
};

export const UsageView = () => {
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProviderStats[]>([]);
  const [totals, setTotals] = useState({ requests: 0, cost: 0 });

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    setLoading(true);
    
    // Get last 30 days of usage
    const thirtyDaysAgo = format(subDays(startOfDay(new Date()), 30), 'yyyy-MM-dd');
    
    const { data, error } = await supabase
      .from('ai_usage')
      .select('*')
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error loading usage:', error);
    } else {
      setUsage(data || []);
      calculateStats(data || []);
    }
    
    setLoading(false);
  };

  const calculateStats = (data: UsageRecord[]) => {
    const providerMap = new Map<string, ProviderStats>();
    let totalRequests = 0;
    let totalCost = 0;

    data.forEach(record => {
      const provider = record.provider;
      const cost = Number(record.estimated_cost_usd) || 0;
      
      totalRequests += record.request_count;
      totalCost += cost;
      
      if (!providerMap.has(provider)) {
        providerMap.set(provider, {
          provider,
          totalRequests: 0,
          totalCost: 0,
          models: []
        });
      }
      
      const stats = providerMap.get(provider)!;
      stats.totalRequests += record.request_count;
      stats.totalCost += cost;
      
      const modelIdx = stats.models.findIndex(m => m.model === record.model);
      if (modelIdx >= 0) {
        stats.models[modelIdx].requests += record.request_count;
        stats.models[modelIdx].cost += cost;
      } else {
        stats.models.push({
          model: record.model,
          requests: record.request_count,
          cost
        });
      }
    });

    setStats(Array.from(providerMap.values()).sort((a, b) => b.totalRequests - a.totalRequests));
    setTotals({ requests: totalRequests, cost: totalCost });
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'lovable': return 'bg-primary/10 text-primary border-primary/20';
      case 'openai': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'anthropic': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'gemini': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'openrouter': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totals.requests.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Requests (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totals.cost.toFixed(4)}</p>
                <p className="text-sm text-muted-foreground">Estimated Cost (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.length}</p>
                <p className="text-sm text-muted-foreground">Active Providers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Breakdown */}
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Usage by Provider
          </CardTitle>
          <CardDescription>Request counts and estimated costs per AI provider</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No usage data yet</p>
              <p className="text-sm">Usage will be tracked when AI requests are made</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.map((stat) => (
                <div key={stat.provider} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex justify-between items-center mb-3">
                    <Badge variant="outline" className={getProviderColor(stat.provider)}>
                      {stat.provider.charAt(0).toUpperCase() + stat.provider.slice(1)}
                    </Badge>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Zap className="w-4 h-4 text-primary" />
                        {stat.totalRequests.toLocaleString()} requests
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-green-500" />
                        ${stat.totalCost.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {stat.models.map((model) => (
                      <div key={model.model} className="text-sm p-2 rounded bg-background/50">
                        <p className="font-medium truncate" title={model.model}>
                          {model.model}
                        </p>
                        <p className="text-muted-foreground">
                          {model.requests} req · ${model.cost.toFixed(4)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Reference */}
      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Cost Reference</CardTitle>
          <CardDescription>Estimated costs per 1M tokens for each model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="font-medium text-primary mb-2">Lovable AI (Free)</p>
              <p className="text-xs text-muted-foreground">All Lovable AI models are free to use</p>
            </div>
            
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="font-medium text-green-500 mb-2">OpenAI</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>GPT-4o: $2.50 / $10.00</p>
                <p>GPT-4o-mini: $0.15 / $0.60</p>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <p className="font-medium text-orange-500 mb-2">Anthropic</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Claude 3.5 Sonnet: $3.00 / $15.00</p>
                <p>Claude 3.5 Haiku: $0.80 / $4.00</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
