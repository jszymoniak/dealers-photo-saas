'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { ArrowLeft, Save, Edit2, Car, Calendar, Hash, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function VehicleDetailsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  
  const [vehicle, setVehicle] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    plate: '',
    vin: '',
    firstRegistrationDate: '',
    currentRegistrationDate: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Stany do usuwania tła
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState({ current: 0, total: 0, status: '' });

  useEffect(() => {
    const fetchVehicle = async () => {
      try {
        const docRef = doc(db, 'vehicles', resolvedParams.vehicleId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setVehicle(data);
          setFormData({
            brand: data.brand || '',
            model: data.model || '',
            plate: data.plate || '',
            vin: data.vin || '',
            firstRegistrationDate: data.firstRegistrationDate || '',
            currentRegistrationDate: data.currentRegistrationDate || ''
          });
        }
      } catch (error) {
        console.error("Błąd pobierania danych pojazdu:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVehicle();
  }, [resolvedParams.vehicleId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'vehicles', resolvedParams.vehicleId);
      await updateDoc(docRef, {
        brand: formData.brand,
        model: formData.model,
        plate: formData.plate,
        vin: formData.vin,
        firstRegistrationDate: formData.firstRegistrationDate,
        currentRegistrationDate: formData.currentRegistrationDate
      });
      setVehicle({ ...vehicle, ...formData });
      setIsEditing(false);
    } catch (error) {
      console.error("Błąd zapisu:", error);
      alert("Nie udało się zapisać zmian.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Funkcja czyszcząca tło z 8 zdjęć zewnętrznych
  const handleRemoveBackgrounds = async () => {
    if (!vehicle || !vehicle.photos) return;

    // Filtrujemy tylko zdjęcia z zewnątrz (ext_)
    const extKeys = Object.keys(vehicle.photos).filter(key => key.startsWith('ext_'));
    if (extKeys.length === 0) {
      alert("Brak zdjęć zewnętrznych do przetworzenia.");
      return;
    }

    setIsProcessingBg(true);
    setBgProgress({ current: 0, total: extKeys.length, status: 'Inicjalizacja...' });

    try {
      const updatedPhotos = { ...vehicle.photos };

      for (let i = 0; i < extKeys.length; i++) {
        const key = extKeys[i];
        const oldUrl = updatedPhotos[key];
        
        setBgProgress({ current: i + 1, total: extKeys.length, status: `Wycinanie tła: krok ${key.replace('ext_', '')}...` });

        // 1. Wysłanie starego zdjęcia do API remove.bg
        const res = await fetch('/api/remove-bg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: oldUrl }),
        });
        
        const data = await res.json();
        
        if (data.success && data.imageBase64) {
          setBgProgress({ current: i + 1, total: extKeys.length, status: `Zapisywanie w chmurze...` });
          
          // 2. Zapisanie nowego pliku PNG w Firebase Storage (folder /processed)
          const imagePath = `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/processed/${key}.png`;
          const storageRef = ref(storage, imagePath);
          
          await uploadString(storageRef, data.imageBase64, 'data_url');
          const newUrl = await getDownloadURL(storageRef);
          
          // 3. Zastąpienie starego URL nowym (bez tła)
          updatedPhotos[key] = newUrl;
        } else {
          console.error(`Błąd wycinania tła dla ${key}:`, data.error);
        }
      }

      setBgProgress(prev => ({ ...prev, status: 'Aktualizacja bazy danych...' }));

      // 4. Aktualizacja bazy Firestore nowymi linkami
      const docRef = doc(db, 'vehicles', resolvedParams.vehicleId);
      await updateDoc(docRef, { photos: updatedPhotos });
      
      setVehicle({ ...vehicle, photos: updatedPhotos });
      alert("Tło zostało pomyślnie wycięte ze zdjęć zewnętrznych!");

    } catch (error) {
      console.error("Błąd podczas przetwarzania:", error);
      alert("Wystąpił błąd podczas usuwania tła.");
    } finally {
      setIsProcessingBg(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-emerald-400">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p>Wczytywanie kartoteki...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4">Nie znaleziono pojazdu</h1>
        <Link href="/dashboard" className="text-emerald-400 hover:underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Wróć do centrali
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Nagłówek i przyciski akcji */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div>
            <Link href="/dashboard" className="text-slate-400 hover:text-emerald-400 mb-2 inline-flex items-center gap-2 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> Wróć do listy
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Car className="w-8 h-8 text-emerald-500" />
              {vehicle.brand && vehicle.brand !== 'Brak' ? `${vehicle.brand} ${vehicle.model}` : 'Nowy Pojazd'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">ID Sesji: {resolvedParams.vehicleId}</p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {/* Przycisk usuwania tła */}
            <button 
              onClick={handleRemoveBackgrounds} 
              disabled={isProcessingBg}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(79,70,229,0.4)]"
            >
              {isProcessingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isProcessingBg ? `Przetwarzanie ${bgProgress.current}/${bgProgress.total}...` : '✨ Usuń tło 360°'}
            </button>

            {isEditing ? (
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Zapisz
              </button>
            ) : (
              <button 
                onClick={() => setIsEditing(true)} 
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all border border-slate-700"
              >
                <Edit2 className="w-4 h-4" /> Edytuj
              </button>
            )}
          </div>
        </div>

        {/* Modal nakładka pokazująca postęp usuwania tła */}
        {isProcessingBg && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
              <Sparkles className="w-12 h-12 text-indigo-500 animate-pulse mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2 text-white">Tworzenie Wirtualnego Studia</h3>
              <p className="text-slate-400 text-sm mb-6">Wykrywanie i usuwanie tła ze zdjęć pojazdu...</p>
              
              <div className="w-full bg-slate-800 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(bgProgress.current / bgProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-indigo-400 font-mono">{bgProgress.status}</p>
            </div>
          </div>
        )}

        {/* Główny kontent: Dane + Galeria */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lewa kolumna: Formularz */}
          <div className="lg:col-span-1 bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit space-y-4">
            <h2 className="text-xl font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Hash className="w-5 h-5 text-emerald-500" /> Dane Pojazdu
            </h2>
            
            {[
              { label: 'Marka', name: 'brand', icon: <Car className="w-4 h-4" /> },
              { label: 'Model', name: 'model', icon: <Car className="w-4 h-4" /> },
              { label: 'Nr Rejestracyjny', name: 'plate', icon: <Hash className="w-4 h-4" /> },
              { label: 'Numer VIN', name: 'vin', icon: <Hash className="w-4 h-4" /> },
              { label: 'Pierwsza Rejestracja', name: 'firstRegistrationDate', icon: <Calendar className="w-4 h-4" /> },
              { label: 'Data Wydania DR', name: 'currentRegistrationDate', icon: <Calendar className="w-4 h-4" /> }
            ].map((field) => (
              <div key={field.name} className="flex flex-col">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1.5">
                  {field.icon} {field.label}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name={field.name}
                    value={formData[field.name as keyof typeof formData]}
                    onChange={handleInputChange}
                    className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                ) : (
                  <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-slate-200 font-medium">
                    {vehicle[field.name] || 'Brak danych'}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Prawa kolumna: Galeria Zdjęć */}
          <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h2 className="text-xl font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-emerald-500" /> Dokumentacja Zdjęciowa
            </h2>
            
            {vehicle.photos && Object.keys(vehicle.photos).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(vehicle.photos).map(([stepId, url]) => (
                  <div key={stepId} className="group relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center checkered-bg">
                    {/* checkered-bg to klasa pomocnicza dla przezroczystości */}
                    <style jsx>{`
                      .checkered-bg {
                        background-image: linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%);
                        background-size: 20px 20px;
                        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                      }
                    `}</style>
                    <img 
                      src={url as string} 
                      alt={`Zdjęcie z kroku: ${stepId}`}
                      className="max-w-full max-h-full object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                        {stepId.replace('ext_', 'Zew: ').replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
                <p>Brak zdjęć w tej sesji</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}