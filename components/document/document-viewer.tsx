
import React, { useRef, useMemo, useEffect } from 'react';
import { Annotation, TextRange } from '../../types';

interface DocumentViewerProps {
  content: string;
  annotations: Annotation[];
  onSelectRange: (range: TextRange) => void;
  activeAnnotationId?: string | null;
  onAnnotationClick: (id: string) => void;
  searchTerm?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  content,
  annotations,
  onSelectRange,
  activeAnnotationId,
  onAnnotationClick,
  searchTerm
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) return;

    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(containerRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    
    const start = preSelectionRange.toString().length;
    const selectedText = selection.toString();
    const end = start + selectedText.length;

    if (selectedText.trim().length > 0) {
      onSelectRange({ start, end, text: selectedText });
    }
  };

  const renderedContent = useMemo(() => {
    if (!content) return null;

    const boundaries = new Set<number>([0, content.length]);
    annotations.forEach(a => {
      boundaries.add(a.range.start);
      boundaries.add(a.range.end);
    });

    if (searchTerm && searchTerm.length > 2) {
      const regex = new RegExp(searchTerm, 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        boundaries.add(match.index);
        boundaries.add(match.index + match[0].length);
      }
    }

    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
    const segments: React.ReactNode[] = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const start = sortedBoundaries[i];
      const end = sortedBoundaries[i+1];
      const text = content.slice(start, end);
      
      const activeAnnos = annotations.filter(a => 
        start >= a.range.start && end <= a.range.end
      );

      const isSearchMatch = searchTerm && searchTerm.length > 2 && 
                          text.toLowerCase().includes(searchTerm.toLowerCase());

      const wrapInSearch = (node: React.ReactNode) => (
        <mark key={`search-${start}-${end}`} className="bg-yellow-200 text-slate-900 border-b-2 border-yellow-500">
          {node}
        </mark>
      );

      if (activeAnnos.length > 0) {
        const isSelected = activeAnnos.some(a => a.id === activeAnnotationId);
        const isFlash = activeAnnos.some(a => a.id.startsWith('flash-'));
        const primaryAnno = activeAnnos.sort((a, b) => b.timestamp - a.timestamp)[0];
        const baseColor = isFlash ? '#10b981' : primaryAnno.userColor;
        const totalReplies = activeAnnos.reduce((sum, a) => sum + (a.replies?.length || 0), 0);
        
        let annotationNode = (
          <mark
            key={`${start}-${end}`}
            onClick={(e) => {
              e.stopPropagation();
              onAnnotationClick(primaryAnno.id);
            }}
            className={`cursor-pointer transition-all duration-300 border-b-2 relative group ${
              isSelected 
                ? 'bg-blue-100/50 border-blue-600 scale-[1.01] z-10' 
                : 'bg-opacity-20 hover:bg-opacity-40'
            } ${isFlash ? 'bg-emerald-50 border-emerald-500' : ''}`}
            style={{ 
              backgroundColor: isSelected ? undefined : `${baseColor}22`,
              borderBottomColor: isSelected ? undefined : baseColor
            }}
          >
            {text}
            {totalReplies > 0 && (
              <span className="absolute -top-3 -right-2 bg-blue-600 text-white text-[7px] font-black px-1 rounded-full shadow-sm z-10 scale-90">
                {totalReplies}
              </span>
            )}
          </mark>
        );

        segments.push(isSearchMatch ? wrapInSearch(annotationNode) : annotationNode);
      } else {
        segments.push(
          isSearchMatch 
            ? wrapInSearch(<span key={`${start}-${end}`}>{text}</span>)
            : <span key={`${start}-${end}`}>{text}</span>
        );
      }
    }

    return segments;
  }, [content, annotations, activeAnnotationId, onAnnotationClick, searchTerm]);

  return (
    <div className="relative bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-2xl border border-gray-100 p-6 sm:p-8 md:p-14 min-h-[400px] md:min-h-[800px] overflow-auto custom-scrollbar">
      <div 
        ref={containerRef}
        onMouseUp={handleSelection}
        onTouchEnd={(e) => {
          // Add a tiny delay to ensure selection API has updated after touch
          setTimeout(handleSelection, 100);
        }}
        className="prose prose-slate max-w-none text-slate-800 leading-[1.8] md:leading-[2.2] whitespace-pre-wrap selection:bg-blue-500/20 text-[14px] sm:text-[16px] md:text-[18px] lg:text-[19px] tracking-tight"
        style={{ fontVariantLigatures: 'common-ligatures' }}
      >
        {renderedContent}
      </div>
    </div>
  );
};
