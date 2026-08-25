import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageUrl, prompt } = await req.json();

    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: 'Brak obrazka lub promptu' }, { status: 400 });
    }

    if (!process.env.PHOTOROOM_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza PHOTOROOM_API_KEY w pliku konfiguracji' }, { status: 500 });
    }

    // Budujemy zapytanie multipart/form-data (wymagane przez API Photoroom)
    const formData = new FormData();
    formData.append('imageUrl', imageUrl);
    formData.append('background.prompt', prompt);
    
    // Uderzamy do najnowszego silnika edycji obrazów Photoroom
    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.PHOTOROOM_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Błąd API Photoroom:", errorText);
      return NextResponse.json({ error: `Odrzucono zapytanie do Photoroom API: ${response.statusText}` }, { status: response.status });
    }

    // Odbieramy plik graficzny (binarny) i zamieniamy go na format Base64, żeby łatwo go zapisać
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    
    // Photoroom oddaje gotowy obraz w formacie PNG
    const dataUrl = `data:image/png;base64,${base64Image}`;

    return NextResponse.json({ success: true, imageBase64: dataUrl });

  } catch (error) {
    console.error('Błąd serwera API generate-bg:', error);
    return NextResponse.json({ error: 'Wystąpił krytyczny błąd na serwerze podczas komunikacji z AI' }, { status: 500 });
  }
}