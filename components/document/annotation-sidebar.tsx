
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Annotation, Reply, User } from '../../types';
import { Button } from '../ui/button';
import { documentService } from '../../services/document-service';

interface AppAnnotation extends Annotation {
  isTemporary?: boolean;
}

interface AnnotationSidebarProps {
  annotations: AppAnnotation[];
  activeAnnotationId?: string | null;
  onAnnotationClick: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  currentUser: User;
  documentTitle: string;
}

export const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({
  annotations,
  activeAnnotationId,
  onAnnotationClick,
  onDeleteAnnotation,
  currentUser,
  documentTitle
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Edit/Reply states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyValue, setReplyValue] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);

  // Extract unique users for filtering
  const users = useMemo(() => {
    const map = new Map();
    annotations.forEach(a => map.set(a.userId, a.userName));
    return Array.from(map.entries());
  }, [annotations]);

  const filteredAnnotations = useMemo(() => {
    let filtered = [...annotations];
    
    // Filter by User
    if (filterUser !== 'all') {
      filtered = filtered.filter(a => a.userId === filterUser);
    }

    // Filter by Date Range
    if (startDate) {
      const start = new Date(startDate).getTime();
      filtered = filtered.filter(a => a.timestamp >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime() + 86400000;
      filtered = filtered.filter(a => a.timestamp <= end);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }, [annotations, filterUser, startDate, endDate]);

  useEffect(() => {
    if (activeAnnotationId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeAnnotationId]);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(annotations, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${documentTitle}_annotations.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const clearFilters = () => {
    setFilterUser('all');
    setStartDate('');
    setEndDate('');
  };

  const startEditing = (anno: Annotation) => {
    setEditingId(anno.id);
    setEditValue(anno.comment);
    setReplyingId(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return;
    setIsSavingEdit(true);
    try {
      await documentService.updateAnnotation(editingId, editValue);
      setEditingId(null);
      setEditValue('');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const startReply = (annoId: string) => {
    setReplyingId(annoId);
    setReplyValue('');
    setEditingId(null);
  };

  const submitReply = async (annoId: string) => {
    if (!replyValue.trim()) return;
    setIsPostingReply(true);
    try {
      const newReply: Reply = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.name,
        userColor: currentUser.color,
        comment: replyValue,
        timestamp: Date.now()
      };

      await documentService.addReply(annoId, newReply);
      setReplyingId(null);
      setReplyValue('');
    } finally {
      setIsPostingReply(false);
    }
  };

  return (
    <div ref={sidebarRef} className="w-full flex flex-col h-full bg-slate-50 md:border-l border-slate-200">
      <div className="p-4 md:p-6 border-b border-slate-200 bg-white shadow-sm z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800 flex items-center gap-2 text-base md:text-lg">
            <span>Activity</span>
            <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              {filteredAnnotations.length}
            </span>
          </h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-xl border transition-all ${showFilters ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600'}`}
              title="Toggle Filters"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z"/></svg>
            </button>
            <button 
              onClick={handleExport}
              className="p-2 rounded-xl border bg-white border-slate-100 text-slate-400 hover:text-slate-600 transition-all hover:shadow-md"
              title="Export JSON"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 border-t border-slate-50 mt-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Author</label>
              <select 
                value={filterUser} 
                onChange={(e) => setFilterUser(e.target.value)}
                className="w-full bg-slate-50 border-0 rounded-xl px-4 py-2 text-[11px] md:text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Collaborators</option>
                {users.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">From</label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border-0 rounded-xl px-2 md:px-3 py-1.5 md:py-2 text-[10px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">To</label>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border-0 rounded-xl px-2 md:px-3 py-1.5 md:py-2 text-[10px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        {filteredAnnotations.length === 0 ? (
          <div className="text-center py-16 md:py-20 px-4 md:px-8">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
              <svg className="w-8 h-8 md:w-10 md:h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            </div>
            <p className="text-slate-400 font-bold text-sm">No notes found</p>
          </div>
        ) : (
          filteredAnnotations.map((anno) => (
            <div
              key={anno.id}
              ref={activeAnnotationId === anno.id ? activeRef : null}
              onClick={() => onAnnotationClick(anno.id)}
              className={`p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] transition-all cursor-pointer transform group ${
                activeAnnotationId === anno.id
                  ? 'border-4 border-blue-600 bg-blue-50 shadow-2xl scale-[1.03] z-10'
                  : 'border-2 border-transparent bg-white hover:bg-white hover:shadow-xl hover:scale-[1.01]'
              } ${anno.isTemporary ? 'border-dashed border-emerald-400 opacity-90' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] font-black shadow-sm" 
                    style={{ backgroundColor: anno.userColor }}
                  >
                    {anno.userName.charAt(0)}
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 block leading-tight">
                      {anno.userName}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(anno.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className={`mb-4 border-l-4 rounded-r-2xl pl-4 py-3 bg-slate-50/50 text-[11px] md:text-[12px] leading-relaxed ${activeAnnotationId === anno.id ? 'bg-white' : ''}`} style={{ borderColor: anno.userColor }}>
                <span className="text-slate-700 italic font-medium">"{anno.range.text}"</span>
              </div>
              
              {editingId === anno.id ? (
                <div className="space-y-3" onClick={e => e.stopPropagation()}>
                  <textarea 
                    className="w-full p-4 bg-white border-2 border-blue-100 rounded-xl text-xs md:text-sm outline-none focus:border-blue-500 font-bold custom-scrollbar"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" isLoading={isSavingEdit} className="px-4 text-[10px] font-black uppercase tracking-widest" onClick={saveEdit}>Save Changes</Button>
                    <Button size="sm" variant="ghost" className="px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className={`text-xs md:text-sm break-words leading-relaxed ${activeAnnotationId === anno.id ? 'text-slate-900 font-black' : 'text-slate-600'}`}>
                  {anno.comment}
                </p>
              )}

              {/* Threaded Replies */}
              {anno.replies && anno.replies.length > 0 && (
                <div className="mt-6 space-y-5 pl-4 border-l-2 border-slate-100 relative">
                  {anno.replies.map((reply, idx) => (
                    <div key={reply.id} className="relative group/reply">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[8px] font-black shadow-inner" style={{ backgroundColor: reply.userColor }}>
                          {reply.userName.charAt(0)}
                        </div>
                        <span className="text-[10px] font-black text-slate-800">{reply.userName}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed pl-8 bg-slate-50/30 p-2 rounded-xl border border-transparent hover:border-slate-100 transition-colors">
                        {reply.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Interaction Bar */}
              {!editingId && (
                <div className={`mt-5 flex items-center justify-between transition-opacity duration-300 ${activeAnnotationId === anno.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                  <div className="flex gap-1 md:gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); startReply(anno.id); }}
                      className="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                      Reply
                    </button>
                    {anno.userId === currentUser.id && !anno.isTemporary && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); startEditing(anno); }}
                        className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        Edit
                      </button>
                    )}
                  </div>
                  {anno.userId === currentUser.id && !anno.isTemporary && (
                    <button 
                      className="text-[9px] text-red-400 hover:text-red-600 font-black uppercase tracking-widest transition-colors p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAnnotation(anno.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}

              {/* Reply Composer Inline */}
              {replyingId === anno.id && (
                <div className="mt-5 pt-5 border-t border-slate-100 space-y-3" onClick={e => e.stopPropagation()}>
                   <textarea 
                    className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-500/5 placeholder:text-slate-300 custom-scrollbar shadow-inner"
                    placeholder="Contribute to the thread..."
                    value={replyValue}
                    onChange={e => setReplyValue(e.target.value)}
                    autoFocus
                    rows={2}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="px-4 text-[10px] font-black h-9 uppercase tracking-widest" onClick={() => setReplyingId(null)}>Cancel</Button>
                    <Button size="sm" isLoading={isPostingReply} className="px-6 text-[10px] font-black h-9 uppercase tracking-widest shadow-lg shadow-blue-50" onClick={() => submitReply(anno.id)}>Post Reply</Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
