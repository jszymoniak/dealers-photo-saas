import { NextResponse } from 'next/server';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: 'Brak URL obrazka' }, { status: 400 });
    if (!process.env.GOOGLE_VISION_API_KEY) return NextResponse.json({ error: 'Brak klucza API Google Vision' }, { status: 500 });

    console.log("1. Detekcja tablicy dla:", imageUrl);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Nie udało się pobrać zdjęcia");
    const arrayBuffer = await imageResponse.arrayBuffer();
    const originalImageBuffer = Buffer.from(arrayBuffer);
    const base64Image = originalImageBuffer.toString('base64');

    const metadata = await sharp(originalImageBuffer).metadata();
    const width = metadata.width || 1920;
    const height = metadata.height || 1080;

    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;
    const visionReq = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'OBJECT_LOCALIZATION' },
          { type: 'TEXT_DETECTION' } 
        ]
      }]
    };

    const visionRes = await fetch(visionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visionReq) });
    const visionData = await visionRes.json();
    
    if (visionData.error) throw new Error("Błąd API Google Vision");

    const objects = visionData.responses[0]?.localizedObjectAnnotations || [];
    const texts = visionData.responses[0]?.textAnnotations || [];

    const licensePlate = objects.find((obj: any) => obj.name === 'License plate');

    if (!licensePlate || !licensePlate.boundingPoly || !licensePlate.boundingPoly.normalizedVertices) {
       console.log("Pomijam - nie znaleziono tablicy.");
       return NextResponse.json({ success: true, imageBase64: `data:image/jpeg;base64,${base64Image}`, info: 'no_plate_found' });
    }

    const vertices = licensePlate.boundingPoly.normalizedVertices;
    const lpMinX = Math.min(...vertices.map((v: any) => v.x || 0));
    const lpMaxX = Math.max(...vertices.map((v: any) => v.x || 0));
    const lpMinY = Math.min(...vertices.map((v: any) => v.y || 0));
    const lpMaxY = Math.max(...vertices.map((v: any) => v.y || 0));

    const plateWidth = Math.round((lpMaxX - lpMinX) * width);
    const plateHeight = Math.round((lpMaxY - lpMinY) * height);
    const centerX = ((lpMinX + lpMaxX) / 2) * width;
    const centerY = ((lpMinY + lpMaxY) / 2) * height;

    // NOWY ALGORYTM: Zamiast samego kąta, pobieramy fizyczne wektory perspektywy z tekstu!
    let minDistance = Infinity;
    let dx = 1, dy = 0, hx = 0, hy = 1; // Domyślne wektory (jeśli auto stoi na wprost)

    for (let i = 1; i < texts.length; i++) {
        const textPoly = texts[i].boundingPoly.vertices;
        if (textPoly && textPoly.length >= 2) {
            const textCenterX = ((textPoly[0].x || 0) + (textPoly[1].x || 0)) / 2;
            const textCenterY = ((textPoly[0].y || 0) + (textPoly[2]?.y || textPoly[1].y || 0)) / 2;
            
            const distance = Math.sqrt(Math.pow(textCenterX - centerX, 2) + Math.pow(textCenterY - centerY, 2));
            
            if (distance < plateWidth && distance < minDistance) {
                minDistance = distance;
                const tl = textPoly[0];
                const tr = textPoly[1];
                const br = textPoly[2] || textPoly[1];
                const bl = textPoly[3] || textPoly[0];

                // Wektor górnej krawędzi (rotacja)
                dx = (tr.x || 0) - (tl.x || 0);
                dy = (tr.y || 0) - (tl.y || 0);
                // Wektor lewej krawędzi (skos perspektywiczny / pitch)
                hx = (bl.x || 0) - (tl.x || 0);
                hy = (bl.y || 0) - (tl.y || 0);
            }
        }
    }

    const platePath = path.join(process.cwd(), 'public', 'dealer-plate.png');
    if (!fs.existsSync(platePath)) throw new Error("Brak pliku dealer-plate.png w folderze public/");
    const plateMeta = await sharp(platePath).metadata();
    const originalW = plateMeta.width || 1040;
    const originalH = plateMeta.height || 228;

    const scaleFactor = 1.02; 
    const finalW = plateWidth * scaleFactor;
    const finalH = plateHeight * scaleFactor;

    // Normalizacja wektorów tekstowych
    const len1 = Math.sqrt(dx * dx + dy * dy) || 1;
    const len2 = Math.sqrt(hx * hx + hy * hy) || 1;

    // MAGIA MATEMATYKI: Przekształcenie Afiniczne (symulacja 3D / Skosu)
    const a = (dx / len1) * (finalW / originalW);
    const c = (dy / len1) * (finalW / originalW);
    const b = (hx / len2) * (finalH / originalH);
    const d = (hy / len2) * (finalH / originalH);

    console.log(`2. Wyliczono macierz afiniczną (symulacja 3D): [${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)}, ${d.toFixed(2)}]`);

    // Transformacja - używamy .affine zamiast .rotate!
    const transformedPlateBuffer = await sharp(platePath)
      .affine([a, b, c, d], { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    // Ponieważ równoległobok jest idealnie symetryczny, jego środek pokrywa się ze środkiem obwiedni (Bounding Box)
    const transformedMeta = await sharp(transformedPlateBuffer).metadata();
    const compositeX = Math.round(centerX - ((transformedMeta.width || finalW) / 2));
    const compositeY = Math.round(centerY - ((transformedMeta.height || finalH) / 2));

    const finalImageBuffer = await sharp(originalImageBuffer)
      .composite([{ input: transformedPlateBuffer, top: compositeY, left: compositeX }])
      .jpeg({ quality: 90 })
      .toBuffer();

    const finalBase64 = finalImageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${finalBase64}`;

    return NextResponse.json({ success: true, imageBase64: dataUrl, info: 'plate_replaced' });

  } catch (error: any) {
    console.error('Błąd serwera API replace-plate:', error);
    return NextResponse.json({ error: error.message || 'Wystąpił błąd' }, { status: 500 });
  }
}