
import React, { useState } from 'react';
import { Button } from '../ui/button';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";

// Standardize worker loading from reliable CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

interface UploadZoneProps {
  onUpload: (title: string, content: string) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onUpload }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && content) {
      onUpload(title, content);
      setTitle('');
      setContent('');
      setIsExpanded(false);
    }
  };

  const performAIOCR = async (pdf: pdfjsLib.PDFDocumentProxy): Promise<string> => {
    try {
      let ocrCombinedText = '';
      const pagesToProcess = Math.min(pdf.numPages, 3);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      for (let i = 1; i <= pagesToProcess; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
              { text: "Extract and transcribe all text from this page accurately. Keep paragraphs and headings. Just return the text." }
            ]
          }
        });
        
        ocrCombinedText += (response.text || '') + '\n\n';
      }
      
      return ocrCombinedText.trim();
    } catch (err) {
      console.error('AI OCR process failed:', err);
      return '';
    }
  };

  const extractTextFromPDF = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const data = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ 
        data: data,
        useSystemFonts: true,
        stopAtErrors: false,
      });

      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ');
          fullText += pageText + '\n\n';
        } catch (pageErr) {
          console.warn(`Page ${i} skip:`, pageErr);
        }
      }

      const result = fullText.trim();
      
      if (!result || result.length < 100) {
        setIsParsing(true);
        const ocrResult = await performAIOCR(pdf);
        if (ocrResult && ocrResult.length > 50) return ocrResult;
        
        if (!result) {
          throw new Error('This document contains no selectable text and AI OCR could not find meaningful content.');
        }
      }
      
      return result;
    } catch (err: any) {
      console.error('PDF parsing error:', err);
      throw new Error(err.message || 'Could not extract text from PDF.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setError(null);
    setTitle(file.name);

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      
      if (fileType === 'txt') {
        const text = await file.text();
        setContent(text);
        setIsExpanded(true);
      } 
      else if (fileType === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const text = await extractTextFromPDF(arrayBuffer);
        setContent(text);
        setIsExpanded(true);
      } 
      else if (fileType === 'docx' || fileType === 'doc') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (!result.value) throw new Error('Word document appears to be empty.');
        setContent(result.value);
        setIsExpanded(true);
      } 
      else {
        throw new Error('Unsupported format. Please use .pdf, .docx, or .txt');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsParsing(false);
      if (e.target) e.target.value = '';
    }
  };

  if (!isExpanded) {
    return (
      <div 
        className={`p-12 sm:p-20 border-[4px] border-dashed rounded-[3rem] bg-white transition-all text-center cursor-pointer group hover:scale-[1.005] active:scale-[0.99] ${
          isParsing ? 'border-blue-300 bg-blue-50/20 shadow-none' : 'border-slate-200 hover:border-blue-600 hover:bg-blue-50/5 shadow-2xl shadow-slate-200/50'
        }`}
        onClick={() => !isParsing && document.getElementById('file-upload')?.click()}
      >
        <div className="flex flex-col items-center">
          <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] bg-slate-50 flex items-center justify-center mb-8 sm:mb-10 group-hover:bg-blue-600 transition-all shadow-inner ${isParsing ? 'animate-pulse' : ''}`}>
            {isParsing ? (
              <svg className="animate-spin h-12 w-12 sm:h-16 sm:w-16 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
          </div>
          
          <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 sm:mb-6 tracking-tight">{isParsing ? 'Processing Document...' : 'Import for Review'}</h3>
          <p className="text-slate-500 font-bold max-w-lg mx-auto mb-10 sm:mb-12 leading-relaxed uppercase tracking-[0.25em] text-[10px] sm:text-[11px]">Multi-user annotation for PDF, DOCX, and Text documents. AI OCR enabled for scans.</p>
          
          {error && (
            <div className="mb-10 px-8 py-5 bg-red-50 border-2 border-red-100 rounded-2xl text-red-600 text-sm font-bold animate-in fade-in slide-in-from-top-2">
              <span className="block mb-1 uppercase tracking-widest text-[10px]">Import Failure</span>
              <span className="font-medium opacity-90">{error}</span>
            </div>
          )}
          
          <input type="file" accept=".txt,.pdf,.doc,.docx" className="hidden" id="file-upload" onChange={handleFileUpload} disabled={isParsing} />
          
          {!isParsing && (
            <div className="flex flex-col items-center gap-6">
              <Button size="lg" className="px-20 h-16 rounded-[1.5rem] shadow-2xl shadow-blue-200 font-black text-lg sm:text-xl transform transition-transform hover:scale-105 active:scale-95">Select File</Button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }} className="text-slate-400 hover:text-blue-600 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.3em] transition-all border-b border-transparent hover:border-blue-600 pb-1">or paste text manually</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 sm:p-14 lg:p-20 rounded-[3rem] border border-slate-100 shadow-[0_48px_160px_-48px_rgba(0,0,0,0.1)] space-y-10 sm:space-y-12 animate-in fade-in zoom-in-95 duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
        <div>
          <h3 className="font-black text-slate-900 text-3xl sm:text-4xl tracking-tighter mb-2">Import Preview</h3>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-[0.3em]">Verify the extracted content before starting the session</p>
        </div>
        <button type="button" onClick={() => { setIsExpanded(false); setTitle(''); setContent(''); setError(null); }} className="text-slate-300 hover:text-red-500 p-2 bg-slate-50 hover:bg-red-50 rounded-full transition-all self-end sm:self-auto">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-10">
        <div className="animate-in fade-in slide-in-from-left-6 duration-500">
          <label className="block text-[11px] font-black text-slate-800 uppercase tracking-[0.4em] mb-4 ml-2">Document Title</label>
          <input 
            autoFocus 
            className="w-full px-8 py-5 sm:py-6 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[1.5rem] outline-none transition-all font-black text-slate-800 text-lg sm:text-xl shadow-inner" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder="e.g. FY25 Market Outlook" 
            required 
          />
        </div>
        <div className="animate-in fade-in slide-in-from-left-8 duration-700">
          <label className="block text-[11px] font-black text-slate-800 uppercase tracking-[0.4em] mb-4 ml-2">Text Content</label>
          <textarea 
            className="w-full px-8 py-6 sm:py-10 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[2rem] outline-none transition-all min-h-[400px] lg:min-h-[550px] text-[15px] sm:text-[16px] leading-relaxed text-slate-700 font-medium custom-scrollbar shadow-inner resize-none" 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            placeholder="Content parsing in progress..." 
            required 
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-center gap-8 pt-6 border-t border-slate-50">
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="px-5 py-2 bg-blue-50 text-blue-700 text-[10px] sm:text-[11px] font-black rounded-full border border-blue-100 uppercase tracking-widest shadow-sm">
            {content.length > 0 ? `${content.split(/\s+/).length} Words` : '0 Words'}
          </div>
          <div className="px-5 py-2 bg-slate-50 text-slate-500 text-[10px] sm:text-[11px] font-black rounded-full border border-slate-100 uppercase tracking-widest shadow-sm">
            {content.length} Chars
          </div>
        </div>
        <div className="flex gap-6 w-full lg:w-auto">
          <Button variant="ghost" type="button" className="flex-1 lg:flex-none font-black text-slate-400 hover:text-slate-600 px-10 h-14" onClick={() => { setIsExpanded(false); setTitle(''); setContent(''); }}>Discard</Button>
          <Button type="submit" className="flex-1 lg:flex-none px-16 h-16 rounded-[1.5rem] shadow-2xl shadow-blue-100 bg-blue-600 hover:bg-blue-700 font-black text-lg sm:text-xl transition-all transform hover:scale-[1.03] active:scale-95">Open Workspace</Button>
        </div>
      </div>
    </form>
  );
};
