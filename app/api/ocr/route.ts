import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();
    
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza API w konfiguracji' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.7-flash' });

    const base64Data = imageBase64.split(',')[1] || imageBase64;

    // Nowy, zaawansowany prompt, wymuszający strukturę JSON
    const prompt = `Przeanalizuj to zdjęcie. Może to być zdjęcie samochodu z tablicą rejestracyjną LUB zdjęcie otwartego polskiego dowodu rejestracyjnego.
    
    Twoim zadaniem jest wyciągnięcie danych i zwrócenie ich w formacie JSON.
    Jeśli to dowód rejestracyjny, znajdź:
    - Numer rejestracyjny
    - Numer VIN (pozycja E w dowodzie)
    - Markę pojazdu
    - Model pojazdu
    
    Jeśli to tylko zdjęcie tablicy, wypełnij tylko numer rejestracyjny.
    Zwróć TYLKO surowy JSON, bez znaczników markdown, według tego schematu:
    {
      "plate": "odczytany_numer_bez_spacji",
      "vin": "odczytany_vin",
      "brand": "marka",
      "model": "model"
    }
    Jeśli czegoś nie potrafisz odczytać, wstaw null.`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      }
    ]);

    let text = result.response.text().trim();
    // Zabezpieczenie: czyszczenie, gdyby Gemini mimo wszystko dodało znaczniki ```json
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsedData = JSON.parse(text);

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error('Błąd silnika AI:', error);
    return NextResponse.json({ error: 'Wystąpił błąd analizy obrazu' }, { status: 500 });
  }
}