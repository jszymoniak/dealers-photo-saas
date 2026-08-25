import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    if (!process.env.REMOVE_BG_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza API remove.bg w konfiguracji' }, { status: 500 });
    }

    // Wysyłamy żądanie do API remove.bg
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.REMOVE_BG_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        size: 'auto', // Używamy optymalnego rozmiaru
        type: 'car',  // Algorytm remove.bg zoptymalizowany pod samochody!
        format: 'png' // Wymuszamy PNG, żeby mieć przezroczyste tło
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Błąd API remove.bg:", errorText);
      return NextResponse.json({ error: 'Nie udało się usunąć tła' }, { status: response.status });
    }

    // Odbieramy plik binarny i zamieniamy na Base64, żeby łatwo go wysłać do frontendu/Firebase
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    return NextResponse.json({ success: true, imageBase64: dataUrl });

  } catch (error) {
    console.error('Błąd serwera API remove-bg:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}