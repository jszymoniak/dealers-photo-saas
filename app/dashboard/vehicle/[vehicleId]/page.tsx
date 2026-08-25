'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { ArrowLeft, Save, Edit2, Car, Calendar, Hash, Image as ImageIcon, Loader2, Sparkles, Trash2, Camera, CheckCircle2, Circle, Eye, X, MoveHorizontal, ImagePlus } from 'lucide-react';
import Link from 'next/link';

const PRESET_PROMPTS = [
  { id: 'custom', label: '✍️ Wpisz własny...', value: '' },
  { id: 'studio-light', label: 'Jasne Studio', value: 'Profesjonalne jasne studio motoryzacyjne, biała epoksydowa podłoga, miękkie górne oświetlenie softbox, fotorealistyczne' },
  { id: 'studio-dark', label: 'Ciemne Studio Premium', value: 'Ciemne ekskluzywne studio, czarna lśniąca podłoga, punktowe oświetlenie ledowe akcentujące sylwetkę, 8k resolution' },
  { id: 'outdoor-modern', label: 'Nowoczesny Podjazd', value: 'Nowoczesny dom jednorodzinny w tle, betonowy podjazd z płyt architektonicznych, słoneczny dzień, błękitne niebo' },
  { id: 'outdoor-industrial', label: 'Loft / Industrial', value: 'Wnętrze starego industrialnego magazynu, ściany z czerwonej cegły, wylany beton, ciepłe światło z dużych okien' }
];

const ROTATION_ORDER = ['ext_front', 'ext_front_right', 'ext_right', 'ext_back_right', 'ext_back', 'ext_back_left', 'ext_left', 'ext_front_left'];

const BACKGROUNDS = [
  { id: 'dark-studio', name: 'Ciemne Studio', css: 'bg-gradient-to-b from-slate-900 via-slate-950 to-black' },
  { id: 'light-studio', name: 'Jasny Showroom', css: 'bg-gradient-to-b from-slate-100 via-white to-slate-200' },
  { id: 'premium-gold', name: 'Premium Gold', css: 'bg-gradient-to-b from-slate-900 via-zinc-900 to-amber-950/40' },
];

export default function VehicleDetailsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  
  const [vehicle, setVehicle] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ brand: '', model: '', plate: '', vin: '', firstRegistrationDate: '', currentRegistrationDate: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState({ current: 0, total: 0, status: '' });
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  
  // NOWE: Stany dla generatora AI
  const [bgPrompt, setBgPrompt] = useState(PRESET_PROMPTS[1].value);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  
  // Stany dla 360° i teł
  const [show360, setShow360] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [activeBg, setActiveBg] = useState(BACKGROUNDS[0]);
  const dragStartX = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeStepToReplace, setActiveStepToReplace] = useState<string | null>(null);

  useEffect(() => {
    const fetchVehicle = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'vehicles', resolvedParams.vehicleId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setVehicle(data);
          setFormData({ brand: data.brand || '', model: data.model || '', plate: data.plate || '', vin: data.vin || '', firstRegistrationDate: data.firstRegistrationDate || '', currentRegistrationDate: data.currentRegistrationDate || '' });
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchVehicle();
  }, [resolvedParams.vehicleId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { ...formData });
      setVehicle({ ...vehicle, ...formData });
      setIsEditing(false);
    } catch (error) { alert("Błąd zapisu."); } finally { setIsSaving(false); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const togglePhotoSelection = (stepId: string) => setSelectedPhotos(prev => prev.includes(stepId) ? prev.filter(id => id !== stepId) : [...prev, stepId]);

  const handleDeletePhoto = async (stepId: string, url: string) => {
    if (!confirm('Usunąć zdjęcie?')) return;
    try {
      try { await deleteObject(ref(storage, url)); } catch (e) {}
      const updatedPhotos = { ...vehicle.photos };
      delete updatedPhotos[stepId];
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos });
      setVehicle({ ...vehicle, photos: updatedPhotos });
      setSelectedPhotos(prev => prev.filter(id => id !== stepId)); 
    } catch (error) { alert("Błąd usuwania."); }
  };

  const handleDeleteKartoteka = async () => {
    if (!confirm('Usunąć całą kartotekę i wszystkie zdjęcia?')) return;
    setIsSaving(true);
    try {
      if (vehicle.photos) {
        for (const url of Object.values(vehicle.photos)) {
          if (url !== 'loading') try { await deleteObject(ref(storage, url as string)); } catch (e) {}
        }
      }
      await deleteDoc(doc(db, 'vehicles', resolvedParams.vehicleId));
      router.push('/dashboard');
    } catch (error) { alert("Błąd."); setIsSaving(false); }
  };

  const initReplacePhoto = (stepId: string) => { setActiveStepToReplace(stepId); fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStepToReplace || !vehicle.dealerId) return;
    const originalUrl = vehicle.photos?.[activeStepToReplace];
    const updatedPhotos = { ...(vehicle.photos || {}) };
    setVehicle({ ...vehicle, photos: { ...updatedPhotos, [activeStepToReplace]: 'loading' }});
    try {
      const storageRef = ref(storage, `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/raw/${activeStepToReplace}_replaced_${Date.now()}.jpg`);
      await uploadBytes(storageRef, file);
      updatedPhotos[activeStepToReplace] = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos });
      setVehicle({ ...vehicle, photos: updatedPhotos });
    } catch (error) {
      if (originalUrl) setVehicle({ ...vehicle, photos: { ...updatedPhotos, [activeStepToReplace]: originalUrl }}); 
    } finally { setActiveStepToReplace(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveBackgrounds = async () => {
    if (selectedPhotos.length === 0) return alert("Wybierz zdjęcia.");
    setIsProcessingBg(true);
    setBgProgress({ current: 0, total: selectedPhotos.length, status: 'Inicjalizacja...' });
    try {
      const updatedPhotos = { ...vehicle.photos };
      for (let i = 0; i < selectedPhotos.length; i++) {
        const key = selectedPhotos[i];
        setBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Wycinanie tła: krok ${key.replace('ext_', '')}...` });
        const res = await fetch('/api/remove-bg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: updatedPhotos[key] }) });
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) throw new Error(`Błąd serwera API.`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error);
        setBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Zapisywanie w chmurze...` });
        const storageRef = ref(storage, `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/processed/${key}_${Date.now()}.png`);
        await uploadString(storageRef, data.imageBase64, 'data_url');
        updatedPhotos[key] = await getDownloadURL(storageRef);
      }
      setBgProgress(prev => ({ ...prev, status: 'Aktualizacja...' }));
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos });
      setVehicle({ ...vehicle, photos: updatedPhotos });
      setSelectedPhotos([]); alert("Tło usunięte!");
    } catch (error: any) { alert(`Błąd: ${error.message}`); } finally { setIsProcessingBg(false); }
  };

  const available360Photos = ROTATION_ORDER.map(key => vehicle?.photos?.[key]).filter(Boolean);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || available360Photos.length === 0) return;
    
    const pixelsPerFrame = 40; 
    const deltaX = e.clientX - dragStartX.current;
    
    if (Math.abs(deltaX) > pixelsPerFrame) {
      const direction = deltaX > 0 ? -1 : 1; 
      setCurrentFrame(prev => {
        let next = prev + direction;
        if (next >= available360Photos.length) next = 0;
        if (next < 0) next = available360Photos.length - 1;
        return next;
      });
      dragStartX.current = e.clientX; 
    }
  }, [isDragging, available360Photos.length]);

  const handlePointerUp = () => setIsDragging(false);

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-emerald-400"><Loader2 className="w-10 h-10 animate-spin mb-4" /></div>;
  if (!vehicle) return <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center"><h1 className="text-2xl font-bold mb-4">Nie znaleziono pojazdu</h1><Link href="/dashboard" className="text-emerald-400">Wróć</Link></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* --- MODAL WIRTUALNEJ OBROTNICY 360 --- */}
      {show360 && available360Photos.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className={`absolute inset-0 transition-colors duration-700 ${activeBg.css}`}></div>

          <div className="p-6 flex justify-between items-center z-10 relative">
            <div>
              <h2 className={`text-2xl font-bold flex items-center gap-2 ${activeBg.id === 'light-studio' ? 'text-slate-900' : 'text-white'}`}>
                <Sparkles className="w-6 h-6 text-indigo-500" /> Studio 360°
              </h2>
              <p className={`text-sm ${activeBg.id === 'light-studio' ? 'text-slate-600' : 'text-slate-400'}`}>{vehicle.brand} {vehicle.model}</p>
            </div>
            
            <div className="flex gap-2 bg-black/20 backdrop-blur-md p-1.5 rounded-xl border border-white/10 hidden md:flex">
               {BACKGROUNDS.map(bg => (
                 <button 
                    key={bg.id} 
                    onClick={() => setActiveBg(bg)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeBg.id === bg.id ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                 >
                   {bg.name}
                 </button>
               ))}
            </div>

            <button onClick={() => setShow360(false)} className={`p-3 rounded-full transition-colors border ${activeBg.id === 'light-studio' ? 'bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300' : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'}`}>
              <X className="w-6 h-6" />
            </button>
          </div>

          <div 
            className="flex-1 relative overflow-hidden select-none touch-none flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[20%] w-[80%] max-w-3xl h-32 blur-3xl rounded-[100%] pointer-events-none transition-colors duration-700 ${activeBg.id === 'light-studio' ? 'bg-black/20' : 'bg-black/60'}`}></div>

            <img 
              src={available360Photos[currentFrame]} 
              alt="Widok 360"
              className="relative z-10 w-full max-w-5xl max-h-[70vh] object-contain pointer-events-none drop-shadow-2xl"
              draggable="false"
            />

            <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center animate-pulse opacity-50 pointer-events-none ${activeBg.id === 'light-studio' ? 'text-slate-800' : 'text-white'}`}>
              <MoveHorizontal className="w-8 h-8 mb-2" />
              <span className="text-sm font-bold tracking-widest uppercase">Przesuń, aby obrócić</span>
            </div>
          </div>
        </div>
      )}

      {/* --- RESZTA STRONY --- */}
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div>
            <Link href="/dashboard" className="text-slate-400 hover:text-emerald-400 mb-2 inline-flex items-center gap-2 text-sm transition-colors"><ArrowLeft className="w-4 h-4" /> Wróć do listy</Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3"><Car className="w-8 h-8 text-emerald-500" />{vehicle.brand && vehicle.brand !== 'Brak' ? `${vehicle.brand} ${vehicle.model}` : 'Nowy Pojazd'}</h1>
          </div>
          
          <div className="flex flex-wrap gap-2 md:gap-3 w-full xl:w-auto">
            <button onClick={() => setShow360(true)} disabled={available360Photos.length === 0} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(79,70,229,0.4)]">
              <Eye className="w-4 h-4" /> Podgląd 360°
            </button>
            <Link href={`/session/${resolvedParams.vehicleId}`} className="px-4 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"><Camera className="w-4 h-4" /> Aparat</Link>
            <button onClick={handleRemoveBackgrounds} disabled={isProcessingBg || selectedPhotos.length === 0} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${selectedPhotos.length > 0 ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {isProcessingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Usuń tło ({selectedPhotos.length})
            </button>
            {isEditing ? (
              <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"><Save className="w-4 h-4" /> Zapisz</button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"><Edit2 className="w-4 h-4" /> Edytuj</button>
            )}
            <button onClick={handleDeleteKartoteka} disabled={isSaving} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50 ml-auto xl:ml-2"><Trash2 className="w-4 h-4" /> Usuń</button>
          </div>
        </div>

        {isProcessingBg && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
              <Sparkles className="w-12 h-12 text-indigo-500 animate-pulse mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Tworzenie Wirtualnego Studia</h3>
              <div className="w-full bg-slate-800 rounded-full h-3 my-4 overflow-hidden"><div className="bg-indigo-500 h-3 rounded-full transition-all duration-300" style={{ width: `${(bgProgress.current / bgProgress.total) * 100}%` }}/></div>
              <p className="text-xs text-indigo-400 font-mono">{bgProgress.status}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit space-y-4">
            <h2 className="text-xl font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><Hash className="w-5 h-5 text-emerald-500" /> Dane Pojazdu</h2>
            {[{ label: 'Marka', name: 'brand' }, { label: 'Model', name: 'model' }, { label: 'Nr Rejestracyjny', name: 'plate' }, { label: 'Numer VIN', name: 'vin' }, { label: 'Pierwsza Rejestracja', name: 'firstRegistrationDate' }, { label: 'Data Wydania DR', name: 'currentRegistrationDate' }].map(field => (
              <div key={field.name} className="flex flex-col">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">{field.label}</label>
                {isEditing ? <input type="text" name={field.name} value={formData[field.name as keyof typeof formData]} onChange={handleInputChange} className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500" /> : <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-2.5 text-slate-200 font-medium">{vehicle[field.name] || 'Brak'}</div>}
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
            {/* ZMODYFIKOWANY NAGŁÓWEK GALERII */}
            <div className="flex flex-col mb-6 gap-4 border-b border-slate-800 pb-5">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-emerald-500" /> Dokumentacja Zdjęciowa
                  </h2>
                  <span className="text-sm text-slate-400 mt-1 block">Wybrano do edycji: <strong className="text-indigo-400">{selectedPhotos.length}</strong></span>
                </div>
              </div>

              {/* KOKPIT GENERATORA TŁA AI */}
              <div className="w-full flex flex-col gap-3 p-4 bg-slate-950/60 rounded-xl border border-indigo-500/20 shadow-[inset_0_0_20px_rgba(79,70,229,0.05)]">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <label className="text-sm text-indigo-300 font-bold uppercase tracking-wider">
                    Inteligentne Tło AI (Vertex / Inpainting)
                  </label>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <select 
                    onChange={(e) => setBgPrompt(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 outline-none w-full sm:w-1/3 cursor-pointer"
                  >
                    {PRESET_PROMPTS.map(preset => (
                      <option key={preset.id} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>

                  <input 
                    type="text" 
                    value={bgPrompt}
                    onChange={(e) => setBgPrompt(e.target.value)}
                    placeholder="Wybierz styl z listy lub opisz własną scenerię..."
                    className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 outline-none w-full flex-1"
                  />
                  
                  <button 
                    disabled={selectedPhotos.length === 0 || isGeneratingBg}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${selectedPhotos.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {isGeneratingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    Podstaw tło AI
                  </button>
                </div>
                <p className="text-xs text-slate-500 font-medium">Zaznacz kółkiem miniatury poniżej, a następnie wygeneruj im nowe tło zachowując oryginalne cienie pod kołami.</p>
              </div>
            </div>
            
            {vehicle.photos && Object.keys(vehicle.photos).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(vehicle.photos).map(([stepId, url]) => {
                  const isSelected = selectedPhotos.includes(stepId);
                  const isLoading = url === 'loading';
                  return (
                    <div key={stepId} className={`group relative aspect-video bg-slate-950 rounded-xl overflow-hidden border-2 flex items-center justify-center checkered-bg ${isSelected ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'}`}>
                      <style jsx>{`.checkered-bg { background-image: linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;}`}</style>
                      {isLoading ? <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /> : <img src={url as string} alt={stepId} className="max-w-full max-h-full object-contain" />}
                      {!isLoading && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                          <div className="flex justify-between items-start">
                            <button onClick={() => togglePhotoSelection(stepId)} className="text-white p-1 hover:text-indigo-400">{isSelected ? <CheckCircle2 className="w-7 h-7 text-indigo-500 fill-white" /> : <Circle className="w-7 h-7" />}</button>
                            <div className="flex gap-2 bg-black/60 rounded-lg p-1 border border-white/10">
                              <button onClick={() => initReplacePhoto(stepId)} className="p-1.5 text-slate-300 hover:text-emerald-400"><Camera className="w-5 h-5" /></button>
                              <button onClick={() => handleDeletePhoto(stepId, url as string)} className="p-1.5 text-slate-300 hover:text-rose-400"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </div>
                          <div className="flex justify-center"><span className="text-white text-xs font-bold uppercase bg-black/70 px-3 py-1 rounded-md">{stepId.replace('ext_', '').replace('_', ' ')}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-center py-12 text-slate-500">Brak zdjęć w tej sesji</p>}
          </div>
        </div>
      </div>
    </div>
  );
}