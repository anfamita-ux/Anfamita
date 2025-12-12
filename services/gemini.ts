import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from "@google/genai";
import { LectureContent, QuizQuestion, UploadedFile } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Lecture Generation ---

export const generateLecture = async (
  files: UploadedFile[],
  language: string
): Promise<LectureContent> => {
  const model = "gemini-3-pro-preview";

  const fileParts = files.map(f => ({
    inlineData: {
      mimeType: f.mimeType,
      data: f.data
    }
  }));

  const prompt = `
    You are a distinguished university professor. 
    Analyze the provided book pages (Language: ${language}). 
    Create a comprehensive lecture plan in ENGLISH to teach this material to a student.
    
    Structure the response as a JSON object with a title, a brief summary, and a list of sections.
    For each section, provide a heading, a detailed explanation (content), and a specific prompt to generate a visual aid (diagram, chart, or illustration) that explains the concept.
    
    The visual prompt should be descriptive, e.g., "A detailed biological diagram of a plant cell labeled with parts".
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      role: 'user',
      parts: [...fileParts, { text: prompt }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                content: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["heading", "content", "visualPrompt"]
            }
          }
        },
        required: ["title", "summary", "sections"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text) as LectureContent;
};

// --- Image Generation ---

export const generateLectureImage = async (prompt: string): Promise<string> => {
  // Using gemini-3-pro-image-preview for high quality educational visuals
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return "https://picsum.photos/800/450?text=Image+Generation+Failed";
  } catch (error) {
    console.error("Image generation failed", error);
    return "https://picsum.photos/800/450?text=Image+Unavailable";
  }
};

// --- Quiz Generation ---

export const generateQuiz = async (lectureContent: LectureContent): Promise<QuizQuestion[]> => {
  const model = "gemini-3-pro-preview";
  
  const prompt = `
    Based on the following lecture content, generate 5 multiple-choice quiz questions to test the student's understanding.
    
    Lecture Title: ${lectureContent.title}
    Lecture Summary: ${lectureContent.summary}
    Sections: ${lectureContent.sections.map(s => s.heading + ": " + s.content).join('\n')}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswerIndex: { type: Type.INTEGER, description: "0-based index of the correct option" }
          },
          required: ["question", "options", "correctAnswerIndex"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) return [];
  return JSON.parse(text) as QuizQuestion[];
};

// --- TTS (Text to Speech) ---

export const playTTS = async (text: string, onEnded: () => void): Promise<() => void> => {
  // Returns a stop function
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, professor-like voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      onEnded();
      return () => {};
    }

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioData = await audioCtx.decodeAudioData(
      Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer
    );

    const source = audioCtx.createBufferSource();
    source.buffer = audioData;
    source.connect(audioCtx.destination);
    source.onended = onEnded;
    source.start();

    return () => {
      try {
        source.stop();
        audioCtx.close();
      } catch (e) { /* ignore */ }
    };

  } catch (error) {
    console.error("TTS Error", error);
    onEnded();
    return () => {};
  }
};