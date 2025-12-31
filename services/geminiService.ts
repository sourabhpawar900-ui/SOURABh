import { GoogleGenAI } from "@google/genai";

export class GeminiImageService {
  private ai: GoogleGenAI;

  constructor() {
    // Initialize the Gemini API client using the required process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async editImage(base64Image: string, prompt: string): Promise<string> {
    // Extract base64 data and mime type
    const matches = base64Image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid image data");
    }

    const mimeType = matches[1];
    const data = matches[2];

    try {
      // Use the gemini-2.5-flash-image model for image editing tasks as per guidelines
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: data,
                mimeType: mimeType,
              },
            },
            {
              text: `Please edit this image according to the following instruction: ${prompt}. Return only the edited image.`,
            },
          ],
        },
      });

      // Gemini 2.5 series image models return multiple parts; find the one containing inlineData
      let resultBase64 = '';
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            resultBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!resultBase64) {
        throw new Error("No image was generated in the response");
      }

      return resultBase64;
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiImageService();