export interface LectureContent {
  title: string;
  summary: string;
  sections: LectureSection[];
}

export interface LectureSection {
  heading: string;
  content: string;
  visualPrompt: string; // Prompt to generate an image
  visualUrl?: string; // Populated after generation
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

export interface UploadedFile {
  data: string; // Base64
  mimeType: string;
}

export enum AppState {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  LECTURE = 'LECTURE',
  QUIZ = 'QUIZ',
}

export enum Language {
  AUTO = 'Auto Detect',
  ENGLISH = 'English',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  CHINESE = 'Chinese',
  JAPANESE = 'Japanese',
  HINDI = 'Hindi',
  ARABIC = 'Arabic',
  BENGALI = 'Bengali'
}