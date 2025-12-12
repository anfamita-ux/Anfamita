import React, { useState, useRef, useEffect } from 'react';
import { AppState, UploadedFile, Language, LectureContent, QuizQuestion } from './types';
import { generateLecture, generateLectureImage, generateQuiz, playTTS } from './services/gemini';
import LiveProfessor from './components/LiveProfessor';
import { BookOpen, Upload, Play, CheckCircle, GraduationCap, ArrowRight, Loader, Image as ImageIcon, MessageSquare, Volume2, StopCircle } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>(AppState.UPLOAD);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(Language.AUTO);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Data
  const [lecture, setLecture] = useState<LectureContent | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  
  // Live Interaction
  const [showLiveProfessor, setShowLiveProfessor] = useState(false);
  const [isReadingLecture, setIsReadingLecture] = useState(false);
  const stopTTSRef = useRef<(() => void) | null>(null);

  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: UploadedFile[] = [];
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // Extract just the base64 part
          const base64Data = base64String.split(',')[1];
          newFiles.push({
            data: base64Data,
            mimeType: file.type
          });
          if (newFiles.length === e.target.files!.length) {
             setFiles(prev => [...prev, ...newFiles]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const startLectureGeneration = async () => {
    if (files.length === 0) return;
    setIsLoading(true);
    setLoadingMessage("Professor is analyzing your books...");
    
    try {
      const content = await generateLecture(files, selectedLanguage);
      setLecture(content);
      
      // Start Image Generation in background
      setLoadingMessage("Creating visual aids...");
      content.sections.forEach(async (section, index) => {
         const imageUrl = await generateLectureImage(section.visualPrompt);
         setGeneratedImages(prev => ({...prev, [index]: imageUrl}));
      });

      setState(AppState.LECTURE);
    } catch (e) {
      alert("Failed to generate lecture. Please try again.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReadLecture = async () => {
    if (isReadingLecture) {
      if (stopTTSRef.current) stopTTSRef.current();
      setIsReadingLecture(false);
      return;
    }

    if (!lecture) return;

    setIsReadingLecture(true);
    // Construct full text to read
    let textToRead = `Welcome to the lecture on ${lecture.title}. ${lecture.summary}. `;
    lecture.sections.forEach(s => {
      textToRead += `${s.heading}. ${s.content}. `;
    });

    const stopFn = await playTTS(textToRead, () => setIsReadingLecture(false));
    stopTTSRef.current = stopFn;
  };

  const startQuiz = async () => {
    if (!lecture) return;
    setIsLoading(true);
    setLoadingMessage("Preparing your quiz...");
    try {
      const questions = await generateQuiz(lecture);
      setQuiz(questions);
      setState(AppState.QUIZ);
    } catch (e) {
      alert("Could not generate quiz.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitQuiz = () => {
    setQuizSubmitted(true);
  };

  const calculateScore = () => {
    let score = 0;
    quiz.forEach((q, i) => {
      if (quizAnswers[i] === q.correctAnswerIndex) score++;
    });
    return score;
  };

  // --- Views ---

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 text-stone-800">
        <Loader className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <h2 className="text-xl font-serif">{loadingMessage}</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-indigo-100">
      
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-stone-200 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-8 h-8 text-indigo-600" />
          <h1 className="text-xl font-serif font-bold tracking-tight text-stone-800">ProfAI</h1>
        </div>
        {state !== AppState.UPLOAD && (
           <button onClick={() => setState(AppState.UPLOAD)} className="text-sm font-medium text-stone-500 hover:text-indigo-600 transition-colors">
             New Class
           </button>
        )}
      </header>

      <main className="pt-24 pb-20 px-6 max-w-5xl mx-auto">
        
        {/* Upload View */}
        {state === AppState.UPLOAD && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
            <div className="text-center space-y-4 max-w-2xl">
              <h2 className="text-4xl md:text-5xl font-serif font-medium text-stone-900 leading-tight">
                Turn your textbooks into <br/> <span className="text-indigo-600">interactive masterclasses</span>.
              </h2>
              <p className="text-lg text-stone-600">
                Upload photos of any book, and our AI Professor will teach you the material, generate diagrams, and quiz your knowledge.
              </p>
            </div>

            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-stone-200/50 border border-stone-100">
              <div className="space-y-6">
                
                {/* File Input */}
                <div className="relative group">
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-stone-300 rounded-xl p-8 flex flex-col items-center justify-center text-center group-hover:border-indigo-500 group-hover:bg-indigo-50/50 transition-all">
                    <Upload className="w-10 h-10 text-stone-400 group-hover:text-indigo-500 mb-3" />
                    <p className="font-medium text-stone-700">Click to upload book pages</p>
                    <p className="text-sm text-stone-400 mt-1">Supports JPG, PNG</p>
                  </div>
                </div>

                {/* Preview */}
                {files.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {files.map((f, i) => (
                      <div key={i} className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-stone-200">
                         <img src={`data:${f.mimeType};base64,${f.data}`} className="w-full h-full object-cover" alt="preview" />
                      </div>
                    ))}
                    <div className="flex items-center justify-center w-16 h-16 text-xs text-stone-500 bg-stone-100 rounded-lg">
                      {files.length} pages
                    </div>
                  </div>
                )}

                {/* Language Select */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Book Language</label>
                  <select 
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value as Language)}
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {Object.values(Language).map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={startLectureGeneration}
                  disabled={files.length === 0}
                  className={`w-full py-3.5 rounded-xl font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-2
                    ${files.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30' : 'bg-stone-300 cursor-not-allowed'}
                  `}
                >
                  <BookOpen className="w-5 h-5" />
                  Start Lecture
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lecture View */}
        {state === AppState.LECTURE && lecture && (
          <div className="space-y-12 animate-fade-in pb-24">
            
            {/* Lecture Hero */}
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-stone-100 relative overflow-hidden">
              <div className="relative z-10 max-w-3xl">
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wide mb-4">
                  Current Lesson
                </span>
                <h2 className="text-4xl md:text-5xl font-serif font-medium text-stone-900 mb-6">{lecture.title}</h2>
                <p className="text-xl text-stone-600 leading-relaxed">{lecture.summary}</p>
              </div>
              <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-indigo-50/50 to-transparent pointer-events-none"></div>
            </div>

            {/* Controls Bar (Sticky) */}
            <div className="sticky top-20 z-30 flex justify-center gap-4 pointer-events-none">
              <div className="bg-white/90 backdrop-blur-md shadow-xl border border-stone-200 rounded-full p-2 flex gap-2 pointer-events-auto">
                <button 
                  onClick={handleReadLecture}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${isReadingLecture ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {isReadingLecture ? <StopCircle className="w-5 h-5"/> : <Volume2 className="w-5 h-5" />}
                  {isReadingLecture ? "Stop Reading" : "Read Lecture"}
                </button>
                <button 
                  onClick={() => setShowLiveProfessor(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <MessageSquare className="w-5 h-5" />
                  Ask Professor
                </button>
              </div>
            </div>

            {/* Lecture Content */}
            <div className="space-y-16 max-w-3xl mx-auto">
              {lecture.sections.map((section, idx) => (
                <div key={idx} className="group">
                  <div className="flex items-baseline gap-4 mb-4">
                    <span className="text-4xl font-serif text-stone-200 font-bold">{idx + 1}</span>
                    <h3 className="text-2xl font-serif font-medium text-stone-800">{section.heading}</h3>
                  </div>
                  
                  <div className="prose prose-lg prose-stone text-stone-600 mb-8">
                    <p>{section.content}</p>
                  </div>

                  {/* Visual Aid */}
                  <div className="bg-stone-100 rounded-2xl overflow-hidden border border-stone-200 aspect-video relative flex items-center justify-center">
                    {generatedImages[idx] ? (
                      <img 
                        src={generatedImages[idx]} 
                        alt={section.visualPrompt} 
                        className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-stone-400">
                        <ImageIcon className="w-8 h-8 mb-2 animate-pulse" />
                        <span className="text-sm">Drawing diagram...</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs">{section.visualPrompt}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Footer */}
            <div className="max-w-3xl mx-auto pt-8 border-t border-stone-200 flex justify-end">
              <button 
                onClick={startQuiz}
                className="flex items-center gap-2 px-8 py-4 bg-stone-900 text-white rounded-full font-semibold hover:bg-stone-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                Take Quiz <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Quiz View */}
        {state === AppState.QUIZ && (
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
             <button onClick={() => setState(AppState.LECTURE)} className="text-sm text-stone-500 hover:text-stone-800 mb-4 flex items-center gap-1">
               &larr; Back to Lecture
             </button>

             <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
               <h2 className="text-3xl font-serif font-medium mb-8">Knowledge Check</h2>
               
               <div className="space-y-8">
                 {quiz.map((q, idx) => (
                   <div key={idx} className="pb-8 border-b border-stone-100 last:border-0 last:pb-0">
                     <p className="text-lg font-medium text-stone-800 mb-4">{idx + 1}. {q.question}</p>
                     <div className="space-y-3">
                       {q.options.map((opt, optIdx) => {
                         const isSelected = quizAnswers[idx] === optIdx;
                         const isCorrect = q.correctAnswerIndex === optIdx;
                         const showResult = quizSubmitted;
                         
                         let btnClass = "w-full text-left p-4 rounded-xl border transition-all ";
                         
                         if (showResult) {
                           if (isCorrect) btnClass += "bg-green-50 border-green-200 text-green-800";
                           else if (isSelected && !isCorrect) btnClass += "bg-red-50 border-red-200 text-red-800";
                           else btnClass += "bg-white border-stone-200 opacity-50";
                         } else {
                           if (isSelected) btnClass += "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200 text-indigo-900";
                           else btnClass += "bg-white border-stone-200 hover:bg-stone-50 text-stone-600";
                         }

                         return (
                           <button
                             key={optIdx}
                             onClick={() => !quizSubmitted && setQuizAnswers(prev => ({...prev, [idx]: optIdx}))}
                             className={btnClass}
                             disabled={quizSubmitted}
                           >
                             <div className="flex items-center justify-between">
                               <span>{opt}</span>
                               {showResult && isCorrect && <CheckCircle className="w-5 h-5 text-green-600" />}
                             </div>
                           </button>
                         )
                       })}
                     </div>
                   </div>
                 ))}
               </div>
             </div>

             {!quizSubmitted ? (
               <button 
                onClick={submitQuiz}
                disabled={Object.keys(quizAnswers).length !== quiz.length}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-all"
               >
                 Submit Quiz
               </button>
             ) : (
               <div className="bg-stone-900 text-white p-8 rounded-2xl text-center space-y-4">
                 <p className="text-stone-400 uppercase tracking-wider text-sm font-bold">Your Score</p>
                 <p className="text-6xl font-serif">{calculateScore()} / {quiz.length}</p>
                 <button 
                  onClick={() => {
                    setState(AppState.UPLOAD);
                    setFiles([]);
                    setLecture(null);
                    setQuizAnswers({});
                    setQuizSubmitted(false);
                    setGeneratedImages({});
                  }}
                  className="inline-block px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full mt-4 transition-colors"
                 >
                   Start New Class
                 </button>
               </div>
             )}
          </div>
        )}

      </main>

      {/* Live Professor Modal */}
      {showLiveProfessor && (
        <LiveProfessor 
          files={files} 
          onClose={() => setShowLiveProfessor(false)}
          contextSummary={lecture ? `${lecture.title}: ${lecture.summary}` : "Uploaded book pages"}
        />
      )}
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}