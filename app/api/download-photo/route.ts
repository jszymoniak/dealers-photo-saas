import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Odczytujemy URL zdjęcia i nazwę pliku z parametrów zapytania
  const { searchParams } = new URL(req.url);
  const fileUrl = searchParams.get('url');
  const fileName = searchParams.get('name') || 'download.jpg';

  if (!fileUrl) {
    return new NextResponse('Brak URL zdjęcia', { status: 400 });
  }

  try {
    // Serwer pobiera zdjęcie z Firebase (backend ignoruje blokady CORS!)
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Nie udało się pobrać pliku');

    // Zamieniamy na dane binarne
    const buffer = await response.arrayBuffer();

    // Odsyłamy do przeglądarki z nagłówkiem wymuszającym zapisanie na dysku
    return new NextResponse(buffer, {
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      },
    });
  } catch (error) {
    console.error('Błąd proxy pobierania:', error);
    return new NextResponse('Błąd pobierania', { status: 500 });
  }
}