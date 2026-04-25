import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { 
  Search, 
  Send, 
  Clock, 
  User, 
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Flag,
  Inbox,
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { ThreadPriority, ThreadStatus } from '../types/dtos';

export default function SupportInboxPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => api.support.getThreads({ limit: 25 }),
    refetchInterval: 10_000,
  });

  React.useEffect(() => {
    if (!selectedThreadId && threads?.success && threads.data.items.length) {
      setSelectedThreadId(threads.data.items[0].id);
    }
  }, [selectedThreadId, threads]);

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', selectedThreadId],
    queryFn: () => api.support.getMessages(selectedThreadId!),
    enabled: !!selectedThreadId,
    refetchInterval: 8_000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: { text: string } }) => api.support.reply(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedThreadId] });
      setReplyContent('');
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !selectedThreadId) return;
    replyMutation.mutate({ id: selectedThreadId, content: { text: replyContent } });
  };

  const selectedThread = threads?.success ? threads.data.items.find(t => t.id === selectedThreadId) : undefined;

  const updateThreadMutation = useMutation({
    mutationFn: ({ id, status, priority }: { id: string; status?: ThreadStatus; priority?: ThreadPriority }) =>
      api.support.updateThread(id, { status, priority }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  });

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-120px)] min-h-0 -mt-2">
      <p
        role="note"
        className="shrink-0 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600 leading-relaxed"
      >
        <span className="font-medium text-slate-700">Admin note — email ingress:</span> Rows here are{' '}
        <code className="text-[10px] bg-slate-100 px-1 rounded">support_threads</code> in Admin.{' '}
        <span className="text-slate-700">In-app support tickets</span> from the Farely app (outbox → ingest,{' '}
        <code className="text-[10px] bg-slate-100 px-1 rounded">source: in_app</code>) appear without Brevo.{' '}
        <span className="text-slate-700">Email threads</span> (
        <code className="text-[10px] bg-slate-100 px-1 rounded">source: email</code>) need Brevo inbound on a domain with
        MX. General customer mail until then stays in your external mailbox. App feedback stars/text live under Feedback,
        not necessarily this list. Docs:{' '}
        <code className="text-[10px] bg-slate-100 px-1 rounded">docs/admin/SUPPORT_INBOX_LIFECYCLE_BREVO.md</code>.
      </p>

      <div className="flex flex-1 min-h-0 gap-6 overflow-hidden">
      {/* Sidebar */}
      <div className="w-[380px] flex flex-col gap-4 min-h-0">
        <div className="flex items-center justify-between">
           <h1 className="text-xl font-bold text-slate-900 tracking-tight">Support Inbox</h1>
           <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
             <MoreVertical size={18} />
           </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Filter threads..." className="pl-9 bg-white" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {threadsLoading ? (
             Array.from({ length: 4 }).map((_, i) => (
               <div key={i} className="animate-pulse h-24 bg-slate-100 rounded-xl" />
             ))
          ) : (threads?.success ? threads.data.items : []).map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              className={cn(
                "w-full p-4 rounded-xl text-left transition-all border",
                selectedThreadId === thread.id 
                  ? "bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-100" 
                  : "bg-transparent border-transparent hover:bg-white hover:border-slate-200"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{thread.id}</span>
                <span className="text-[10px] text-slate-400">{formatDate(thread.lastMessageAt)}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 truncate">{thread.subject}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{thread.customer.email}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={thread.priority === 'high' ? 'error' : 'secondary'} className="px-1.5 h-4 text-[9px]">
                    {thread.priority}
                  </Badge>
                  <Badge variant={thread.status === 'open' ? 'success' : 'secondary'} className="px-1.5 h-4 text-[9px]">
                    {thread.status}
                  </Badge>
                </div>
                <div className="flex -space-x-1">
                   {[1, 2].map(i => (
                     <div key={i} className="w-5 h-5 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[8px] font-bold">
                       {i === 1 ? (thread.customer.name || thread.customer.email || '?').slice(0, 1) : ''}
                     </div>
                   ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <Card className="flex-1 flex flex-col bg-white border-slate-200/60 shadow-xl shadow-slate-200/20 rounded-2xl overflow-hidden">
        {selectedThread ? (
          <>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                   {(selectedThread.customer.name || selectedThread.customer.email || '?').slice(0, 1)}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {selectedThread.customer.name || selectedThread.customer.email}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium"><Clock size={12} /> Last active 2h ago</span>
                    <span>•</span>
                    <span className="font-semibold text-emerald-600">{selectedThread.status}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => selectedThreadId && updateThreadMutation.mutate({ id: selectedThreadId, status: 'in_progress' })}
                >
                  Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-emerald-600 hover:text-emerald-700"
                  onClick={() => selectedThreadId && updateThreadMutation.mutate({ id: selectedThreadId, status: 'resolved' })}
                >
                  Resolve
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
               <AnimatePresence mode="popLayout">
                {(messages?.success ? messages.data.messages : []).map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex flex-col max-w-[80%]",
                      msg.direction === 'outbound' ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "group relative px-4 py-3 rounded-2xl text-sm shadow-sm",
                      msg.direction === 'outbound' 
                        ? "bg-emerald-600 text-white rounded-tr-none" 
                        : "bg-white border border-slate-200 text-slate-700 rounded-tl-none"
                    )}>
                      {msg.text}
                      <span className={cn(
                        "absolute -bottom-5 whitespace-nowrap text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity",
                        msg.direction === 'outbound' ? "right-0" : "left-0"
                      )}>
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}
               </AnimatePresence>
               {replyMutation.isPending && (
                  <div className="flex justify-end">
                    <div className="bg-emerald-100 p-3 rounded-2xl rounded-tr-none animate-pulse">
                       <span className="text-emerald-600 text-xs font-bold font-mono">...typing</span>
                    </div>
                  </div>
               )}
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
               <form onSubmit={handleSend} className="relative">
                  <textarea
                    rows={1}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none min-h-[50px] custom-scrollbar"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <div className="absolute right-2 bottom-2">
                    <Button 
                      type="submit" 
                      size="icon" 
                      className="h-9 w-9 rounded-xl"
                      disabled={!replyContent.trim() || replyMutation.isPending}
                    >
                      <Send size={18} />
                    </Button>
                  </div>
               </form>
               <div className="mt-2 px-2 flex gap-4">
                  <button type="button" className="text-xs font-bold text-slate-400 hover:text-emerald-600 flex items-center gap-1">
                    <AlertCircle size={14} /> Internal Note
                  </button>
                  <button type="button" className="text-xs font-bold text-slate-400 hover:text-emerald-600 flex items-center gap-1">
                    <Flag size={14} /> Escalation
                  </button>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-50">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Inbox size={40} className="text-slate-300" />
             </div>
             <h2 className="text-xl font-bold text-slate-900">No thread selected</h2>
             <p className="text-slate-500 max-w-xs mt-2">Pick a support ticket from the sidebar to continue the conversation.</p>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
