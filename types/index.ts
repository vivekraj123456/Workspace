
export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  color: string;
}

export interface Presence {
  userId: string;
  userName: string;
  userColor: string;
  lastActive: number;
  currentDocId: string | null;
}

export interface Reply {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  comment: string;
  timestamp: number;
}

export interface Annotation {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userColor: string;
  range: TextRange;
  comment: string;
  timestamp: number;
  replies?: Reply[];
}

export interface DocumentData {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  authorId: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}
