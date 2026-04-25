import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { formatDate } from '../lib/utils';
import { Star } from 'lucide-react';

export default function FeedbackListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['feedback', 200],
    queryFn: () => api.feedback.list({ limit: 200 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-600 font-semibold">Could not load feedback.</div>;
  }

  const items = data?.success ? data.data.items : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-emerald-950">User feedback</h1>
        <p className="text-slate-500 mt-1">Star ratings and comments from the mobile app (PKR market).</p>
      </div>
      <div className="space-y-4">
        {items.length === 0 && (
          <Card>
            <CardContent className="p-8 text-slate-500">No feedback yet — submissions show here after app users send them.</CardContent>
          </Card>
        )}
        {items.map((f) => (
          <Card key={f.id} className="border-slate-200/80">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={i < f.stars ? 'h-4 w-4 text-amber-500 fill-amber-400' : 'h-4 w-4 text-slate-200'}
                      />
                    ))}
                  </CardTitle>
                  <CardDescription className="text-xs font-mono mt-1">User {f.userId} · {f.source}</CardDescription>
                </div>
                <span className="text-xs text-slate-400 font-semibold shrink-0">{formatDate(f.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">App experience</p>
                <p className="mt-1 whitespace-pre-wrap">{f.appExperience}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Time &amp; value</p>
                <p className="mt-1 whitespace-pre-wrap">{f.timeSavingNote}</p>
              </div>
              {(f.provider || f.handoffId) && (
                <p className="text-xs text-slate-400">
                  {f.provider && <span>Provider: {f.provider}</span>}
                  {f.provider && f.handoffId && ' · '}
                  {f.handoffId && <span>Handoff: {f.handoffId}</span>}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
