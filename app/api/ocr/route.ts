import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();
    
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza API w konfiguracji' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Używamy modelu flash, bo działa błyskawicznie i świetnie analizuje obrazy
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Usuwamy prefiks "data:image/jpeg;base64," z ciągu znaków
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const prompt = "Przeanalizuj to zdjęcie pojazdu. Twoim zadaniem jest odczytać numer rejestracyjny. Zwróć TYLKO I WYŁĄCZNIE odczytany ciąg znaków, bez spacji, bez żadnego dodatkowego tekstu (np. WX12345). Jeśli tablica jest niewidoczna lub nieczytelna, zwróć słowo: BRAK_DANYCH.";

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      }
    ]);

    const text = result.response.text().trim();
    return NextResponse.json({ result: text });
  } catch (error) {
    console.error('Błąd silnika OCR:', error);
    return NextResponse.json({ error: 'Wystąpił błąd analizy obrazu' }, { status: 500 });
  }
}