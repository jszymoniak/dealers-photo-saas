'use client';

import { useState, useRef, useEffect, use } from 'react';
import { Camera, Check, RefreshCw, ChevronRight, UploadCloud, CheckCircle2, Lock } from 'lucide-react';
import { storage, db, auth } from '@/lib/firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Link from 'next/link';

const STEPS = [
  { id: 'registration_doc', name: 'Dowód Rejestracyjny', hint: 'Zrób wyraźne zdjęcie otwartego dowodu (strony z kodem Aztec)' },
  { id: 'license_plate', name: 'Tablica rejestracyjna', hint: 'Wykadruj samą tablicę (do odczytu OCR)' },
  { id: 'front_left', name: 'Przód - Lewy skos (45°)', hint: 'Dopasuj reflektor i koło do obrysu' },
  { id: 'front_center', name: 'Przód - Centralnie', hint: 'Wyrównaj grill i tablicę w środku kadru' },
  // Tymczasowo 2 kroki. Docelowo będzie 8.
];

export default function PhotoSessionPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const resolvedParams = use(params);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Stany autoryzacji SaaS
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Krok 1: Weryfikacja tożsamości
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            const userData = userSnap.data();
            // Jeśli to pracownik, bierzemy jego ID salonu. Jeśli SuperAdmin (Ty), przypisujemy testowo do nivette.
            if (userData.role === 'superadmin') {
              setDealerId('nivette');
            } else if (userData.dealerId) {
              setDealerId(userData.dealerId);
            } else {
              setDealerId(null);
            }
          }
        } catch (err) {
          console.error("Błąd pobierania profilu:", err);
        }
      } else {
        setDealerId(null);
      }
      setAuthLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Krok 2: Odpalenie aparatu po udanej autoryzacji
  useEffect(() => {
    if (!authLoading && dealerId && !isSuccess && !isUploading) {
      startCamera();
    }
    return () => stopCamera();
  }, [authLoading, dealerId, isSuccess, isUploading]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Błąd dostępu do aparatu:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        const stepId = STEPS[currentStep].id;
        setCapturedImages((prev) => ({ ...prev, [stepId]: dataUrl }));
        
        if (currentStep < STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        }
      }
    }
  };

const finishSession = async () => {
    if (!dealerId) return; 
    
    setIsUploading(true);
    stopCamera();

    try {
      const uploadedUrls: Record<string, string> = {};
      let detectedVinOrPlate = 'Oczekuje_na_dane';

      // 1. Zrzut zdjęć do Firebase Storage
      for (const [stepId, dataUrl] of Object.entries(capturedImages)) {
        const imagePath = `${dealerId}/vehicles/${resolvedParams.vehicleId}/raw/${stepId}.jpg`;
        const storageRef = ref(storage, imagePath);
        
        await uploadString(storageRef, dataUrl, 'data_url');
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedUrls[stepId] = downloadUrl;
      }

// 2. Szybka Analiza AI (Priorytet: Dowód, potem Tablica, potem Centralne)
      const imageToAnalyze = capturedImages['registration_doc'] || capturedImages['license_plate'] || capturedImages['front_center'];
      
      let aiExtractedData = { plate: 'Brak', vin: 'Brak', brand: 'Brak', model: 'Brak' };

      if (imageToAnalyze) {
         try {
            const aiResponse = await fetch('/api/ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: imageToAnalyze })
            });
            const aiData = await aiResponse.json();
            
            if (aiData && !aiData.error) {
              aiExtractedData = {
                plate: aiData.plate || 'Brak',
                vin: aiData.vin || 'Brak',
                brand: aiData.brand || 'Brak',
                model: aiData.model || 'Brak'
              };
            }
         } catch (aiErr) {
            console.error("Błąd połączenia z modułem AI:", aiErr);
         }
      }

     // 3. Zapis metadanych sesji w Firestore (wraz z rozbudowanymi danymi z AI!)
      await setDoc(doc(db, 'vehicles', resolvedParams.vehicleId), {
        dealerId: dealerId,
        vin: aiExtractedData.vin,
        plate: aiExtractedData.plate,
        brand: aiExtractedData.brand,
        model: aiExtractedData.model,
        status: 'Gotowe',
        photos: uploadedUrls,
        completedAt: serverTimestamp()
      }, { merge: true });

      setIsSuccess(true);
    } catch (error) {
      console.error("Błąd podczas wysyłania danych:", error);
      alert("Wystąpił błąd podczas wysyłania sesji.");
    } finally {
      setIsUploading(false);
    }
  };

  // ---------------- WIDOKI KONTROLNE ---------------- //

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-emerald-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
        Weryfikacja uprawnień...
      </div>
    );
  }

  if (!dealerId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <Lock className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold">Odmowa dostępu</h1>
        <p className="text-slate-400 mt-2 max-w-sm">Nie masz uprawnień do wykonania sesji zdjęciowej. Zaloguj się na konto pracownika autoryzowanego salonu.</p>
        <Link href="/login" className="mt-6 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition-colors">
          Zaloguj się
        </Link>
      </div>
    );
  }

  if (isUploading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <UploadCloud className="w-16 h-16 text-emerald-500 mb-6 animate-bounce" />
        <h2 className="text-xl font-bold mb-2">Wysyłanie zdjęć na serwer...</h2>
        <div className="w-64 bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
          <div className="bg-emerald-500 h-2 w-2/3 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-[100dvh] bg-[#0A2E20] flex flex-col items-center justify-center text-white p-6">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-[#0A2E20]" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Sesja Zakończona!</h1>
        <p className="text-center text-emerald-100/80 mb-8 max-w-xs">
          Zdjęcia zostały przypisane do kartoteki pojazdu w portalu ({dealerId}).
        </p>
        <Link href="/dashboard" className="w-full max-w-sm py-4 bg-emerald-700 hover:bg-emerald-600 rounded-full font-bold text-lg text-center transition-colors">
          Wróć do centrali
        </Link>
      </div>
    );
  }

  // ---------------- GŁÓWNY INTERFEJS APARATU ---------------- //

  const isLastStep = currentStep === STEPS.length - 1;
  const hasPhotoForCurrentStep = !!capturedImages[STEPS[currentStep].id];

  return (
    <div className="relative min-h-[100dvh] bg-black overflow-hidden select-none">
      {/* Pasek postępu */}
      <div className="absolute top-0 left-0 w-full z-50 bg-black/50 backdrop-blur-sm p-4 pb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white text-xs font-bold uppercase tracking-wider">Krok {currentStep + 1} z {STEPS.length}</span>
          <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-400/10 px-2 py-1 rounded">
            <CheckCircle2 className="w-3 h-3" /> Auto-Ghosting
          </span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-1">
          <div 
            className="bg-emerald-400 h-1 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-3">
          <h2 className="text-white font-bold text-lg leading-tight">{STEPS[currentStep].name}</h2>
          <p className="text-white/60 text-xs">{STEPS[currentStep].hint}</p>
        </div>
      </div>

      {/* Podgląd na żywo */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        suppressHydrationWarning={true}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

     {/* Nałożony obrys samochodu lub dokumentu (Ghosting) */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        {STEPS[currentStep].id === 'registration_doc' ? (
          // Obrys dla dowodu rejestracyjnego (pionowy lub poziomy kwadrat)
          <div className="w-4/5 max-w-sm h-64 border-4 border-blue-400 border-dashed rounded-xl bg-blue-400/10 flex items-center justify-center shadow-[0_0_20px_rgba(96,165,250,0.3)]">
            <span className="text-blue-400 font-bold opacity-70 tracking-widest uppercase text-sm text-center px-4">Otwarty Dowód Rejestracyjny</span>
          </div>
        ) : STEPS[currentStep].id === 'license_plate' ? (
          // Obrys dla tablicy rejestracyjnej
          <div className="w-4/5 max-w-sm h-32 border-4 border-emerald-400 border-dashed rounded-xl bg-emerald-400/10 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.3)]">
            <span className="text-emerald-400 font-bold opacity-70 tracking-widest uppercase text-sm">Umieść tablicę tutaj</span>
          </div>
        ) : (
          // Obrys dla całego samochodu
          <svg viewBox="0 0 800 400" className="w-full h-full max-h-[70vh] opacity-80" preserveAspectRatio="xMidYMid meet">
            {/* ... tutaj zostaje Twój stary kod rysujący autko SVG ... */}
            <path d="M 120 250 L 150 170 L 250 130 L 350 70 L 500 70 L 650 130 L 720 170 L 750 250 L 730 290 L 650 290 A 40 40 0 0 0 570 290 L 310 290 A 40 40 0 0 0 230 290 L 100 290 Z" fill="none" stroke="#34d399" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="270" cy="290" r="40" fill="none" stroke="#34d399" strokeWidth="6" />
            <circle cx="610" cy="290" r="40" fill="none" stroke="#34d399" strokeWidth="6" />
          </svg>
        )}
      </div>

      {/* Panel kontrolny aparatu na dole */}
      <div className="absolute bottom-0 left-0 w-full p-8 z-50 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between">
        <button 
          onClick={() => hasPhotoForCurrentStep && setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 0}
          className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30 backdrop-blur-md"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        {isLastStep && hasPhotoForCurrentStep ? (
          <button
            onClick={finishSession}
            className="flex-1 max-w-[200px] h-14 bg-emerald-500 hover:bg-emerald-400 active:scale-95 rounded-full flex items-center justify-center gap-2 text-white font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] mx-4"
          >
            <Check className="w-6 h-6" /> Zakończ i Wyślij
          </button>
        ) : (
          <button
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full border-4 border-emerald-400 flex items-center justify-center active:scale-95 transition-transform mx-4 bg-black/20 backdrop-blur-sm"
          >
            <div className="w-16 h-16 bg-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-400/50">
              <Camera className="w-8 h-8 text-black" />
            </div>
          </button>
        )}

        <button 
          onClick={() => hasPhotoForCurrentStep && !isLastStep && setCurrentStep(prev => prev + 1)}
          disabled={!hasPhotoForCurrentStep || isLastStep}
          className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30 backdrop-blur-md"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
   </div>
  );
}