
import { DocumentData, Annotation, Presence, Reply } from '../types';

/**
 * Service to manage persistence and mock real-time interactions.
 * Uses LocalStorage events for cross-tab multi-user simulation.
 */
class DocumentService {
  private STORAGE_KEY_DOCS = 'collab_annotate_docs';
  private STORAGE_KEY_ANNOS = 'collab_annotate_annos';
  private STORAGE_KEY_PRESENCE = 'collab_annotate_presence';

  async getDocuments(): Promise<DocumentData[]> {
    const data = localStorage.getItem(this.STORAGE_KEY_DOCS);
    return data ? JSON.parse(data) : [];
  }

  async saveDocument(doc: DocumentData): Promise<void> {
    const docs = await this.getDocuments();
    docs.push(doc);
    localStorage.setItem(this.STORAGE_KEY_DOCS, JSON.stringify(docs));
    window.dispatchEvent(new Event('storage'));
  }

  async getAnnotations(documentId: string): Promise<Annotation[]> {
    const data = localStorage.getItem(this.STORAGE_KEY_ANNOS);
    const all: Annotation[] = data ? JSON.parse(data) : [];
    return all.filter(a => a.documentId === documentId);
  }

  async saveAnnotation(anno: Annotation): Promise<void> {
    const data = localStorage.getItem(this.STORAGE_KEY_ANNOS);
    const all: Annotation[] = data ? JSON.parse(data) : [];
    
    const exists = all.find(a => 
      a.documentId === anno.documentId && 
      a.userId === anno.userId && 
      a.range.start === anno.range.start && 
      a.range.end === anno.range.end
    );
    
    if (exists) return;

    all.push(anno);
    localStorage.setItem(this.STORAGE_KEY_ANNOS, JSON.stringify(all));
    window.dispatchEvent(new Event('storage'));
  }

  async updateAnnotation(id: string, comment: string): Promise<void> {
    const data = localStorage.getItem(this.STORAGE_KEY_ANNOS);
    const all: Annotation[] = data ? JSON.parse(data) : [];
    const index = all.findIndex(a => a.id === id);
    if (index !== -1) {
      all[index].comment = comment;
      localStorage.setItem(this.STORAGE_KEY_ANNOS, JSON.stringify(all));
      window.dispatchEvent(new Event('storage'));
    }
  }

  async addReply(annotationId: string, reply: Reply): Promise<void> {
    const data = localStorage.getItem(this.STORAGE_KEY_ANNOS);
    const all: Annotation[] = data ? JSON.parse(data) : [];
    const index = all.findIndex(a => a.id === annotationId);
    if (index !== -1) {
      if (!all[index].replies) all[index].replies = [];
      all[index].replies?.push(reply);
      localStorage.setItem(this.STORAGE_KEY_ANNOS, JSON.stringify(all));
      window.dispatchEvent(new Event('storage'));
    }
  }

  async deleteAnnotation(id: string): Promise<void> {
    const data = localStorage.getItem(this.STORAGE_KEY_ANNOS);
    const all: Annotation[] = data ? JSON.parse(data) : [];
    const filtered = all.filter(a => a.id !== id);
    localStorage.setItem(this.STORAGE_KEY_ANNOS, JSON.stringify(filtered));
    window.dispatchEvent(new Event('storage'));
  }

  updatePresence(presence: Presence): void {
    const data = localStorage.getItem(this.STORAGE_KEY_PRESENCE);
    let all: Presence[] = data ? JSON.parse(data) : [];
    
    const now = Date.now();
    // Filter out users inactive for > 15s and remove existing record for this user
    all = all.filter(p => p.userId !== presence.userId && (now - p.lastActive) < 15000);
    all.push(presence);
    
    localStorage.setItem(this.STORAGE_KEY_PRESENCE, JSON.stringify(all));
    // Trigger event for immediate local UI update
    window.dispatchEvent(new Event('presence_update'));
  }

  getPresence(): Presence[] {
    const data = localStorage.getItem(this.STORAGE_KEY_PRESENCE);
    const all: Presence[] = data ? JSON.parse(data) : [];
    const now = Date.now();
    return all.filter(p => (now - p.lastActive) < 15000);
  }
}

export const documentService = new DocumentService();
