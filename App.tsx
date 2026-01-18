
import React, { useState, useEffect, useMemo } from 'react';
import { User, DocumentData, Annotation, TextRange, AppStatus, Presence } from './types';
import { documentService } from './services/document-service';
import { Button } from './components/ui/button';
import { DocumentViewer } from './components/document/document-viewer';
import { AnnotationSidebar } from './components/document/annotation-sidebar';
import { UploadZone } from './components/document/upload-zone';
import { GoogleGenAI } from "@google/genai";

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

interface AppAnnotation extends Annotation {
  isTemporary?: boolean;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AppAnnotation[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  
  // UI States
  const [currentSelection, setCurrentSelection] = useState<TextRange | null>(null);
  const [commentText, setCommentText] = useState('');
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingFlash, setIsGeneratingFlash] = useState(false);
  const [tempUserName, setTempUserName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [docSummary, setDocSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummaryInHeader, setShowSummaryInHeader] = useState(false);

  // Responsive UI States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileAnnotationsOpen, setIsMobileAnnotationsOpen] = useState(false);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      setStatus(AppStatus.LOADING);
      try {
        const docs = await documentService.getDocuments();
        setDocuments(docs);
        setStatus(AppStatus.SUCCESS);
      } catch (err) {
        setStatus(AppStatus.ERROR);
      }
    };
    init();
  }, []);

  // Sync & Presence Heartbeat
  useEffect(() => {
    if (!currentUser) return;

    const syncAll = async () => {
      const docs = await documentService.getDocuments();
      setDocuments(docs);
      if (activeDocId) {
        const annos = await documentService.getAnnotations(activeDocId);
        setAnnotations(prev => {
          const temps = prev.filter(a => a.isTemporary);
          return [...annos, ...temps];
        });
      }
      setPresence(documentService.getPresence());
    };

    window.addEventListener('storage', syncAll);
    window.addEventListener('presence_update', syncAll);
    
    const heartbeat = setInterval(() => {
      documentService.updatePresence({
        userId: currentUser.id,
        userName: currentUser.name,
        userColor: currentUser.color,
        lastActive: Date.now(),
        currentDocId: activeDocId
      });
      setPresence(documentService.getPresence());
    }, 2000);

    return () => {
      window.removeEventListener('storage', syncAll);
      window.removeEventListener('presence_update', syncAll);
      clearInterval(heartbeat);
    };
  }, [currentUser, activeDocId]);

  // Handle document switching
  useEffect(() => {
    if (activeDocId) {
      documentService.getAnnotations(activeDocId).then(setAnnotations);
      setCurrentSelection(null);
      setCommentText('');
      setActiveAnnotationId(null);
      setDocSummary(null);
      setSearchTerm('');
      setShowSummaryInHeader(false);
      setIsMobileSidebarOpen(false);
      setIsMobileAnnotationsOpen(false);
    }
  }, [activeDocId]);

  const activeDoc = useMemo(() => 
    documents.find(d => d.id === activeDocId), 
    [documents, activeDocId]
  );

  const activeDocPresence = useMemo(() => 
    presence.filter(p => p.currentDocId === activeDocId && p.userId !== currentUser?.id),
    [presence, activeDocId, currentUser]
  );

  const docUserMap = useMemo(() => {
    const map: Record<string, Presence[]> = {};
    presence.forEach(p => {
      if (p.currentDocId) {
        if (!map[p.currentDocId]) map[p.currentDocId] = [];
        map[p.currentDocId].push(p);
      }
    });
    return map;
  }, [presence]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUserName.trim()) return;
    
    const newUser: User = {
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      name: tempUserName.trim(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    setCurrentUser(newUser);
  };

  const handleUpload = async (title: string, content: string) => {
    if (!currentUser) return;
    const newDoc: DocumentData = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: Date.now(),
      authorId: currentUser.id,
    };
    await documentService.saveDocument(newDoc);
    setDocuments(prev => [...prev, newDoc]);
    setActiveDocId(newDoc.id);
  };

  const handleGenerateSummary = async () => {
    if (!activeDoc) return;
    setIsSummarizing(true);
    setShowSummaryInHeader(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Summarize the following document titled "${activeDoc.title}" in exactly 3 short bullet points. Text: ${activeDoc.content.slice(0, 10000)}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
      });
      setDocSummary(response.text?.trim() || "Summary generation failed.");
    } catch (error) {
      setDocSummary("AI service unavailable. Please check your network connection.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGenerateAIInsight = async () => {
    if (!currentSelection || !activeDoc) return;
    setIsGeneratingAI(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Provide an expert review/critique of this excerpt from the document "${activeDoc.title}": "${currentSelection.text}". Max 25 words.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
      });
      setCommentText(response.text?.trim() || "");
    } catch (error) {
      setCommentText("Drafting failed.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleFlashInsight = async () => {
    if (!currentSelection || !activeDoc || !currentUser) return;
    setIsGeneratingFlash(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `React quickly to this text: "${currentSelection.text}". Under 12 words.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
      });
      
      const flashAnno: AppAnnotation = {
        id: `flash-${crypto.randomUUID()}`,
        documentId: activeDoc.id,
        userId: 'gemini-ai',
        userName: 'Gemini AI',
        userColor: '#10b981',
        range: currentSelection,
        comment: response.text?.trim() || "Interesting point.",
        timestamp: Date.now(),
        isTemporary: true
      };

      setAnnotations(prev => [...prev, flashAnno]);
      setActiveAnnotationId(flashAnno.id);
      setCurrentSelection(null);

      setTimeout(() => {
        setAnnotations(prev => prev.filter(a => a.id !== flashAnno.id));
        if (activeAnnotationId === flashAnno.id) setActiveAnnotationId(null);
      }, 10000);

    } catch (error) {
      console.error("Flash insight failed", error);
    } finally {
      setIsGeneratingFlash(false);
    }
  };

  const handleAddAnnotation = async () => {
    if (!activeDocId || !currentSelection || !commentText.trim() || !currentUser) return;

    const newAnno: Annotation = {
      id: crypto.randomUUID(),
      documentId: activeDocId,
      userId: currentUser.id,
      userName: currentUser.name,
      userColor: currentUser.color,
      range: currentSelection,
      comment: commentText,
      timestamp: Date.now(),
      replies: []
    };

    await documentService.saveAnnotation(newAnno);
    setAnnotations(prev => [...prev, newAnno]);
    setCurrentSelection(null);
    setCommentText('');
    setActiveAnnotationId(newAnno.id);
  };

  const handleDeleteAnnotation = async (id: string) => {
    await documentService.deleteAnnotation(id);
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
        <form onSubmit={handleJoin} className="bg-white p-8 md:p-14 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl border border-slate-200 w-full max-w-lg animate-in fade-in zoom-in-95 duration-500">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600 rounded-[1.25rem] md:rounded-[1.5rem] flex items-center justify-center text-white mb-8 md:mb-10 shadow-xl shadow-blue-100 mx-auto">
            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 text-center tracking-tighter">Collaborate & Annotate</h1>
          <p className="text-slate-500 mb-8 md:mb-10 text-center font-bold text-[10px] md:text-xs uppercase tracking-[0.2em]">High Performance Review Workspace</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Display Name</label>
              <input 
                autoFocus
                className="w-full px-6 md:px-7 py-4 md:py-5 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300"
                placeholder="e.g. Alex"
                value={tempUserName}
                onChange={e => setTempUserName(e.target.value)}
                required
              />
            </div>
            <Button className="w-full h-14 md:h-16 rounded-2xl text-base md:text-lg font-black shadow-xl shadow-blue-100 uppercase tracking-[0.3em]">Join Workspace</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans selection:bg-blue-100">
      {/* Mobile Drawer Backdrops */}
      {(isMobileSidebarOpen || isMobileAnnotationsOpen) && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-[60] md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => { setIsMobileSidebarOpen(false); setIsMobileAnnotationsOpen(false); }} 
        />
      )}

      {/* Library Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 md:w-80 border-r border-slate-200 bg-white flex flex-col shadow-2xl md:shadow-none z-[70] md:z-20 md:static transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-5 md:p-7 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-9 h-9 md:w-11 md:h-11 bg-blue-600 rounded-[0.75rem] md:rounded-[1rem] flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-100">C</div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter">Workspace</h1>
          </div>
          <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 md:space-y-4 custom-scrollbar">
          <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2 block mb-2 md:mb-3">Project Library</span>
          {documents.map(doc => (
            <button
              key={doc.id}
              onClick={() => setActiveDocId(doc.id)}
              className={`w-full text-left px-4 md:px-5 py-3 md:py-4 rounded-[1rem] md:rounded-[1.25rem] text-sm transition-all relative border-2 ${
                activeDocId === doc.id 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xl font-bold' 
                  : 'text-slate-500 bg-white border-slate-50 hover:bg-slate-50 hover:border-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate pr-4 font-bold tracking-tight">{doc.title}</span>
                <div className="flex -space-x-1.5 shrink-0">
                  {docUserMap[doc.id]?.slice(0, 3).map(u => (
                    <div 
                      key={u.userId} 
                      className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border border-white shadow-sm" 
                      style={{ backgroundColor: u.userColor }} 
                    />
                  ))}
                </div>
              </div>
            </button>
          ))}
          <Button 
            variant="ghost" 
            className={`w-full justify-start mt-4 md:mt-6 border-2 border-dashed rounded-[1rem] md:rounded-[1.25rem] h-14 md:h-16 font-black uppercase tracking-[0.2em] text-[9px] md:text-[10px] transition-all ${
              activeDocId === null 
                ? 'bg-blue-50 border-blue-400 text-blue-600 shadow-lg' 
                : 'border-slate-100 text-slate-400 hover:border-blue-400 hover:bg-blue-50'
            }`}
            onClick={() => setActiveDocId(null)}
          >
            + Add Document
          </Button>
        </div>

        <div className="p-5 md:p-7 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-[0.75rem] md:rounded-[1.25rem] flex items-center justify-center text-white font-black shadow-inner border-4 border-white" style={{ backgroundColor: currentUser.color }}>
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm md:text-base font-black text-slate-800 truncate">{currentUser.name}</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest">Active</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50">
        {activeDoc ? (
          <>
            <header className="h-20 md:h-24 flex items-center justify-between px-4 md:px-12 bg-white border-b border-slate-100 z-10 shadow-sm shrink-0">
              <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
                <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden p-2 text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
                <div className="min-w-0">
                  <h2 className="font-black text-lg md:text-2xl text-slate-900 tracking-tighter truncate max-w-[140px] xs:max-w-[200px] md:max-w-md">{activeDoc.title}</h2>
                  <div className="flex items-center gap-3 md:gap-5 mt-0.5 md:mt-1">
                    <div className="flex -space-x-1.5">
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 border-white flex items-center justify-center text-white text-[7px] md:text-[8px] font-black shadow-md ring-2 ring-blue-500/10" style={{ backgroundColor: currentUser.color }}>
                        {currentUser.name.charAt(0)}
                      </div>
                      {activeDocPresence.slice(0, 3).map(p => (
                        <div key={p.userId} className="w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 border-white flex items-center justify-center text-white text-[7px] md:text-[8px] font-black shadow-md" style={{ backgroundColor: p.userColor }}>
                          {p.userName.charAt(0)}
                        </div>
                      ))}
                    </div>
                    <button onClick={handleGenerateSummary} disabled={isSummarizing} className="text-[9px] md:text-[10px] text-blue-600 font-black uppercase tracking-widest hover:text-blue-800 disabled:opacity-50 flex items-center gap-1">
                      {isSummarizing ? (
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <svg className="w-3 md:w-3.5 h-3 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      )}
                      <span className="hidden sm:inline">Summarize</span>
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 md:gap-6">
                <div className="hidden lg:flex relative">
                  <input type="text" placeholder="Context search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-2xl text-[11px] font-bold text-slate-800 focus:ring-4 focus:ring-blue-500/10 outline-none w-48 xl:w-64 transition-all" />
                  <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <button onClick={() => setIsMobileAnnotationsOpen(true)} className="md:hidden p-2 text-slate-400 hover:text-blue-600 transition-colors">
                  <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
                </button>
                <div className="hidden md:block w-px h-10 bg-slate-100" />
                <Button size="sm" className="hidden xs:flex rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em] px-4 md:px-6 h-9 md:h-11 shadow-xl shadow-blue-50">Review Mode</Button>
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-14 custom-scrollbar bg-slate-50/50">
                <div className="max-w-4xl mx-auto">
                  <DocumentViewer
                    content={activeDoc.content}
                    annotations={annotations}
                    activeAnnotationId={activeAnnotationId}
                    onSelectRange={setCurrentSelection}
                    onAnnotationClick={(id) => {
                      setActiveAnnotationId(id);
                      if (window.innerWidth < 768) setIsMobileAnnotationsOpen(true);
                    }}
                    searchTerm={searchTerm}
                  />
                  <div className="h-40" />
                </div>
              </div>

              <aside className={`fixed inset-y-0 right-0 w-full md:w-[360px] lg:w-[400px] bg-white z-[70] md:z-20 md:static transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileAnnotationsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="md:hidden p-5 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                  <h3 className="font-black text-slate-800 text-lg">Annotations</h3>
                  <button onClick={() => setIsMobileAnnotationsOpen(false)} className="p-2 text-slate-400">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <AnnotationSidebar
                    annotations={annotations}
                    activeAnnotationId={activeAnnotationId}
                    onAnnotationClick={setActiveAnnotationId}
                    onDeleteAnnotation={handleDeleteAnnotation}
                    currentUser={currentUser}
                    documentTitle={activeDoc.title}
                  />
                </div>
              </aside>
            </div>

            {/* AI Summary Card (Responsive) */}
            {showSummaryInHeader && (
              <div className="absolute top-20 md:top-24 left-4 right-4 md:left-auto md:right-12 md:w-[450px] bg-slate-900 text-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] shadow-2xl z-40 animate-in slide-in-from-top-6 duration-500">
                <div className="flex justify-between items-center mb-4 md:mb-6">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] opacity-80">AI Snapshot</span>
                  </div>
                  <button onClick={() => setShowSummaryInHeader(false)} className="text-white/40 hover:text-white transition-colors p-1">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="text-[13px] md:text-sm font-medium leading-relaxed md:leading-loose text-blue-50/90 whitespace-pre-wrap italic">
                  {isSummarizing ? (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Summarizing workspace...
                    </div>
                  ) : (docSummary || "Analysis complete.")}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 md:px-12 lg:px-20 py-12 md:py-20 lg:py-24">
              <div className="flex flex-col gap-12 md:gap-20">
                <div className="animate-in fade-in slide-in-from-top-10 duration-700">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)} 
                    className="md:hidden mb-6 flex items-center gap-3 text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-slate-600 group"
                  >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                    Workspace Library
                  </button>
                  <UploadZone onUpload={handleUpload} />
                </div>
                
                {documents.length > 0 && (
                  <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
                    <div className="flex items-center justify-between mb-8 md:mb-12">
                      <h3 className="text-[11px] md:text-[13px] font-black text-slate-800 uppercase tracking-[0.6em] flex items-center gap-4">
                        <span className="bg-slate-900 text-white w-6 h-6 flex items-center justify-center rounded-md text-[10px]">{documents.length}</span>
                        Shared Project Assets
                      </h3>
                      <span className="hidden sm:block h-px bg-slate-200 flex-1 ml-10 opacity-40" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 md:gap-8 lg:gap-10">
                      {documents.map(doc => (
                        <div 
                         key={doc.id} 
                         onClick={() => setActiveDocId(doc.id)} 
                         className="p-8 md:p-10 bg-white border border-slate-100 rounded-[2.5rem] hover:shadow-[0_48px_96px_-32px_rgba(0,0,0,0.12)] hover:-translate-y-3 transition-all cursor-pointer group relative overflow-hidden h-full flex flex-col"
                        >
                          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-50/30 rounded-full -mr-20 -mt-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="w-14 h-14 bg-slate-50 rounded-[1.25rem] mb-8 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner relative z-10 shrink-0">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </div>
                          <h4 className="font-black text-slate-900 text-xl md:text-2xl mb-3 line-clamp-2 tracking-tight group-hover:text-blue-600 transition-colors leading-tight grow">{doc.title}</h4>
                          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-50 shrink-0">
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(doc.createdAt).toLocaleDateString()}</p>
                             <div className="flex -space-x-1.5 shrink-0">
                               {docUserMap[doc.id]?.slice(0, 3).map(u => (
                                 <div 
                                   key={u.userId} 
                                   className="w-4 h-4 rounded-full border border-white shadow-sm" 
                                   style={{ backgroundColor: u.userColor }} 
                                 />
                               ))}
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Selection HUD for New Annotations */}
      {currentSelection && (
        <div className="fixed inset-x-0 bottom-0 md:bottom-6 lg:bottom-10 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl lg:max-w-4xl bg-white rounded-t-[2.5rem] md:rounded-[3rem] shadow-[0_-24px_80px_rgba(0,0,0,0.15)] md:border border-slate-100 p-6 md:p-10 lg:p-12 z-[80] animate-in slide-in-from-bottom-full duration-500 ease-out flex flex-col max-h-[90vh]">
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6 md:hidden" />
          
          <div className="flex items-center justify-between mb-4 md:mb-8">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <span className="px-3 md:px-5 py-1.5 md:py-2 bg-slate-900 text-white rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-lg">New Note</span>
              <Button 
                onClick={handleFlashInsight} 
                isLoading={isGeneratingFlash}
                size="sm"
                className="h-8 md:h-10 py-0 px-4 md:px-6 text-[8px] md:text-[10px] bg-emerald-600 text-white rounded-full flex items-center gap-2 font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-50"
              >
                {!isGeneratingFlash && <svg className="w-3 md:w-4 h-3 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                <span className="hidden xs:inline">Flash React</span>
              </Button>
            </div>
            <button onClick={() => setCurrentSelection(null)} className="text-slate-300 hover:text-slate-600 p-1 md:p-2 transition-colors">
              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          
          <div className="mb-4 md:mb-8 bg-slate-50 p-4 md:p-6 rounded-[1.5rem] border-l-4 md:border-l-8 border-blue-600 max-h-20 md:max-h-32 overflow-y-auto shadow-inner shrink-0">
            <p className="text-[12px] md:text-sm text-slate-700 italic font-medium leading-relaxed font-serif">"{currentSelection.text}"</p>
          </div>

          <div className="relative mb-6 md:mb-8 group grow min-h-0 flex flex-col">
            <textarea 
              autoFocus 
              className="w-full p-5 md:p-7 text-sm md:text-base bg-slate-50 border-0 rounded-[2rem] focus:ring-8 focus:ring-blue-500/5 outline-none font-bold text-slate-800 placeholder:text-slate-300 min-h-[100px] md:min-h-[160px] custom-scrollbar shadow-inner transition-all resize-none grow"
              placeholder="Share your insights..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 md:gap-6 shrink-0 pb-2 md:pb-0">
            <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-[1rem] flex items-center justify-center text-white font-black text-[10px] md:text-xs shadow-lg" style={{ backgroundColor: currentUser.color }}>{currentUser.name.charAt(0)}</div>
              <div>
                <span className="text-[10px] md:text-[11px] font-black text-slate-800 uppercase tracking-widest block leading-tight">{currentUser.name}</span>
                <span className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest">Collaborator</span>
              </div>
            </div>
            <div className="flex gap-3 md:gap-4 w-full sm:w-auto">
              <Button variant="ghost" className="flex-1 sm:flex-none font-black text-slate-400 rounded-xl md:rounded-2xl px-6 md:px-8 h-12 md:h-14" onClick={() => setCurrentSelection(null)}>Discard</Button>
              <Button className="flex-1 sm:flex-none h-12 md:h-16 rounded-xl md:rounded-2xl px-8 md:px-14 font-black text-sm md:text-lg bg-blue-600 shadow-2xl shadow-blue-100 transition-transform active:scale-95" onClick={handleAddAnnotation}>Publish</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
