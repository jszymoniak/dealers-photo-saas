'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { ArrowLeft, Save, Edit2, Car, Calendar, Hash, Image as ImageIcon, Loader2, Sparkles, Trash2, Camera, CheckCircle2, Circle, X, ImagePlus, ZoomIn, ScanText, Undo2, Download } from 'lucide-react';
import Link from 'next/link';

const PRESET_PROMPTS = [
  { id: 'custom', label: '✍️ Wpisz własny...', value: '' },
  { id: 'studio-light', label: 'Jasne Studio', value: 'Profesjonalne jasne studio motoryzacyjne, biała epoksydowa podłoga, miękkie górne oświetlenie softbox, fotorealistyczne' },
  { id: 'studio-dark', label: 'Ciemne Studio Premium', value: 'Ciemne ekskluzywne studio, czarna lśniąca podłoga, punktowe oświetlenie ledowe akcentujące sylwetkę, 8k resolution' },
  { id: 'outdoor-modern', label: 'Nowoczesny Podjazd', value: 'Nowoczesny dom jednorodzinny w tle, betonowy podjazd z płyt architektonicznych, słoneczny dzień, błękitne niebo' },
  { id: 'outdoor-industrial', label: 'Loft / Industrial', value: 'Wnętrze starego industrialnego magazynu, ściany z czerwonej cegły, wylany beton, ciepłe światło z dużych okien' }
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
  
  const [bgPrompt, setBgPrompt] = useState(PRESET_PROMPTS[1].value);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [genBgProgress, setGenBgProgress] = useState({ current: 0, total: 0, status: '' });

  const [isReplacingPlate, setIsReplacingPlate] = useState(false);
  const [plateProgress, setPlateProgress] = useState({ current: 0, total: 0, status: '' });

  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

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

  const handleUndoPhoto = async (stepId: string) => {
    const historyList = vehicle.history?.[stepId] || [];
    if (historyList.length === 0) return;

    const previousUrl = historyList[historyList.length - 1];
    const newHistoryList = historyList.slice(0, -1);

    const updatedPhotos = { ...vehicle.photos, [stepId]: previousUrl };
    const updatedHistory = { ...vehicle.history, [stepId]: newHistoryList };

    setVehicle({ ...vehicle, photos: updatedPhotos, history: updatedHistory });
    
    try {
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), {
        photos: updatedPhotos,
        history: updatedHistory
      });
    } catch (error) {
      alert("Błąd podczas cofania.");
    }
  };

  const handleDeletePhoto = async (stepId: string, url: string) => {
    if (!confirm('Usunąć zdjęcie?')) return;
    try {
      try { await deleteObject(ref(storage, url)); } catch (e) {}
      const updatedPhotos = { ...vehicle.photos };
      delete updatedPhotos[stepId];
      
      const updatedHistory = { ...(vehicle.history || {}) };
      delete updatedHistory[stepId];

      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos, history: updatedHistory });
      setVehicle({ ...vehicle, photos: updatedPhotos, history: updatedHistory });
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

  // NOWOŚĆ: Funkcja do pobierania zdjęć (omija problem otwierania w nowej karcie)
const handleDownloadPhoto = (url: string, stepId: string) => {
    // Tworzymy ładną nazwę pliku
    const cleanBrand = (vehicle.brand || 'Auto').replace(/\s+/g, '_');
    const cleanModel = (vehicle.model || '').replace(/\s+/g, '_');
    const cleanStep = stepId.replace('ext_', '');
    const fileName = `${cleanBrand}_${cleanModel}_${cleanStep}.jpg`;
    
    // Zamiast fetchować bezpośrednio w przeglądarce, uderzamy do naszego nowego endpointu
    const downloadApiUrl = `/api/download-photo?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fileName)}`;
    
    // Tworzymy ukryty link kierujący do naszego serwera i symulujemy kliknięcie
    const link = document.createElement('a');
    link.href = downloadApiUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemoveBackgrounds = async () => {
    if (selectedPhotos.length === 0) return alert("Wybierz zdjęcia.");
    setIsProcessingBg(true);
    setBgProgress({ current: 0, total: selectedPhotos.length, status: 'Inicjalizacja...' });
    try {
      const updatedPhotos = { ...vehicle.photos };
      const updatedHistory = { ...(vehicle.history || {}) };

      for (let i = 0; i < selectedPhotos.length; i++) {
        const key = selectedPhotos[i];
        setBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Wycinanie tła: krok ${key.replace('ext_', '')}...` });
        
        const oldUrl = updatedPhotos[key];
        const res = await fetch('/api/remove-bg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: oldUrl }) });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error);
        
        setBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Zapisywanie w chmurze...` });
        const storageRef = ref(storage, `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/processed/${key}_${Date.now()}.png`);
        await uploadString(storageRef, data.imageBase64, 'data_url');
        
        updatedHistory[key] = [...(updatedHistory[key] || []), oldUrl];
        updatedPhotos[key] = await getDownloadURL(storageRef);
      }
      setBgProgress(prev => ({ ...prev, status: 'Aktualizacja...' }));
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos, history: updatedHistory });
      setVehicle({ ...vehicle, photos: updatedPhotos, history: updatedHistory });
      setSelectedPhotos([]); alert("Tło usunięte!");
    } catch (error: any) { alert(`Błąd: ${error.message}`); } finally { setIsProcessingBg(false); }
  };

  const handleGenerateAIBg = async () => {
    if (selectedPhotos.length === 0) return alert("Wybierz zdjęcia.");
    setIsGeneratingBg(true);
    setGenBgProgress({ current: 0, total: selectedPhotos.length, status: 'Inicjalizacja AI...' });
    try {
      const updatedPhotos = { ...vehicle.photos };
      const updatedHistory = { ...(vehicle.history || {}) };

      for (let i = 0; i < selectedPhotos.length; i++) {
        const key = selectedPhotos[i];
        setGenBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Generowanie tła AI: krok ${key.replace('ext_', '')}...` });
        
        const oldUrl = updatedPhotos[key];
        const res = await fetch('/api/generate-bg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: oldUrl, prompt: bgPrompt }) });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error);
        
        setGenBgProgress({ current: i + 1, total: selectedPhotos.length, status: `Zapisywanie w chmurze...` });
        const storageRef = ref(storage, `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/processed/${key}_ai_${Date.now()}.jpg`);
        await uploadString(storageRef, data.imageBase64, 'data_url');
        
        updatedHistory[key] = [...(updatedHistory[key] || []), oldUrl];
        updatedPhotos[key] = await getDownloadURL(storageRef);
      }
      setGenBgProgress(prev => ({ ...prev, status: 'Aktualizacja...' }));
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos, history: updatedHistory });
      setVehicle({ ...vehicle, photos: updatedPhotos, history: updatedHistory });
      setSelectedPhotos([]); alert("Nowe tło AI zostało wygenerowane!");
    } catch (error: any) { alert(`Błąd: ${error.message}`); } finally { setIsGeneratingBg(false); }
  };

  const handleReplacePlate = async () => {
    if (selectedPhotos.length === 0) return alert("Wybierz zdjęcia z widocznymi tablicami.");
    
    setIsReplacingPlate(true);
    setPlateProgress({ current: 0, total: selectedPhotos.length, status: 'Uruchamianie detektora...' });
    
    try {
      const updatedPhotos = { ...vehicle.photos };
      const updatedHistory = { ...(vehicle.history || {}) };
      
      for (let i = 0; i < selectedPhotos.length; i++) {
        const key = selectedPhotos[i];
        setPlateProgress({ current: i + 1, total: selectedPhotos.length, status: `Szukanie tablicy: krok ${key}...` });
        
        const oldUrl = updatedPhotos[key];
        const res = await fetch('/api/replace-plate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: oldUrl }) });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error);
        
        if (data.info === 'no_plate_found') continue; 
        
        setPlateProgress({ current: i + 1, total: selectedPhotos.length, status: `Zapisywanie z nową tablicą...` });
        const storageRef = ref(storage, `${vehicle.dealerId}/vehicles/${resolvedParams.vehicleId}/processed/${key}_plate_${Date.now()}.jpg`);
        await uploadString(storageRef, data.imageBase64, 'data_url');
        
        updatedHistory[key] = [...(updatedHistory[key] || []), oldUrl];
        updatedPhotos[key] = await getDownloadURL(storageRef);
      }
      
      setPlateProgress(prev => ({ ...prev, status: 'Zakończono...' }));
      await updateDoc(doc(db, 'vehicles', resolvedParams.vehicleId), { photos: updatedPhotos, history: updatedHistory });
      setVehicle({ ...vehicle, photos: updatedPhotos, history: updatedHistory });
      setSelectedPhotos([]); 
      
    } catch (error: any) { 
      alert(`Błąd: ${error.message}`); 
    } finally { 
      setIsReplacingPlate(false); 
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-emerald-400"><Loader2 className="w-10 h-10 animate-spin mb-4" /></div>;
  if (!vehicle) return <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center"><h1 className="text-2xl font-bold mb-4">Nie znaleziono pojazdu</h1><Link href="/dashboard" className="text-emerald-400">Wróć</Link></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* --- Lightbox --- */}
      {fullScreenImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setFullScreenImage(null)}>
          <button className="absolute top-6 right-6 text-white/50 hover:text-white p-2 bg-black/50 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          <div className="relative max-w-7xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl">
            <style jsx>{`.checkered-bg { background-image: linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;}`}</style>
            <div className="absolute inset-0 checkered-bg -z-10"></div>
            <img src={fullScreenImage} className="max-w-full max-h-[90vh] object-contain" alt="Powiększenie" />
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div>
            <Link href="/dashboard" className="text-slate-400 hover:text-emerald-400 mb-2 inline-flex items-center gap-2 text-sm transition-colors"><ArrowLeft className="w-4 h-4" /> Wróć do listy</Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3"><Car className="w-8 h-8 text-emerald-500" />{vehicle.brand && vehicle.brand !== 'Brak' ? `${vehicle.brand} ${vehicle.model}` : 'Nowy Pojazd'}</h1>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full xl:w-auto">
            <Link href={`/session/${resolvedParams.vehicleId}`} className="px-4 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"><Camera className="w-4 h-4" /> Aparat</Link>
            <button onClick={handleRemoveBackgrounds} disabled={isProcessingBg || selectedPhotos.length === 0} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${selectedPhotos.length > 0 ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {isProcessingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Usuń stare tło
            </button>
            {isEditing ? (
              <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"><Save className="w-4 h-4" /> Zapisz</button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"><Edit2 className="w-4 h-4" /> Edytuj</button>
            )}
            <button onClick={handleDeleteKartoteka} disabled={isSaving} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50 ml-auto xl:ml-2"><Trash2 className="w-4 h-4" /> Usuń</button>
          </div>
        </div>

        {/* MODALE POSTĘPU */}
        {(isProcessingBg || isGeneratingBg || isReplacingPlate) && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
              {isReplacingPlate ? <ScanText className="w-12 h-12 text-emerald-500 animate-pulse mx-auto mb-4" /> : <Sparkles className="w-12 h-12 text-indigo-500 animate-pulse mx-auto mb-4" />}
              <h3 className="text-xl font-bold text-white mb-2">Przetwarzanie Zdjęć...</h3>
              <div className="w-full bg-slate-800 rounded-full h-3 my-4 overflow-hidden">
                <div className={`h-3 rounded-full transition-all duration-300 ${isReplacingPlate ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${((isProcessingBg ? bgProgress.current : isGeneratingBg ? genBgProgress.current : plateProgress.current) / (isProcessingBg ? bgProgress.total : isGeneratingBg ? genBgProgress.total : plateProgress.total)) * 100}%` }}/>
              </div>
              <p className="text-xs text-indigo-400 font-mono">
                {isProcessingBg && bgProgress.status}
                {isGeneratingBg && genBgProgress.status}
                {isReplacingPlate && plateProgress.status}
              </p>
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
            <div className="flex flex-col mb-6 gap-4 border-b border-slate-800 pb-5">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-emerald-500" /> Dokumentacja Zdjęciowa
                  </h2>
                  <span className="text-sm text-slate-400 mt-1 block">Wybrano do edycji: <strong className="text-indigo-400">{selectedPhotos.length}</strong></span>
                </div>
              </div>

              <div className="w-full flex flex-col gap-3 p-4 bg-slate-950/60 rounded-xl border border-indigo-500/20 shadow-[inset_0_0_20px_rgba(79,70,229,0.05)]">
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
                    placeholder="Opisz scenerię..."
                    className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 outline-none w-full flex-1"
                  />
                  <button 
                    onClick={handleGenerateAIBg}
                    disabled={selectedPhotos.length === 0 || isGeneratingBg}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${selectedPhotos.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {isGeneratingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    Podstaw tło AI
                  </button>
                </div>

                <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-800/50">
                   <p className="text-xs text-slate-500 font-medium max-w-md">Zaznacz kółkiem miniatury (przód/tył), a system użyje detektora obrazu do odnalezienia i wklejenia wirtualnej tablicy dealera.</p>
                   <button 
                    onClick={handleReplacePlate}
                    disabled={selectedPhotos.length === 0 || isReplacingPlate}
                    className={`px-5 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${selectedPhotos.length > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {isReplacingPlate ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
                    Nałóż tablice dealera
                  </button>
                </div>
              </div>
            </div>
            
            {/* GRID ZDJĘĆ */}
            {vehicle.photos && Object.keys(vehicle.photos).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(vehicle.photos).map(([stepId, url]) => {
                  const isSelected = selectedPhotos.includes(stepId);
                  const isLoading = url === 'loading';
                  const hasHistory = vehicle.history?.[stepId]?.length > 0;

                  return (
                    <div key={stepId} className={`group relative aspect-video bg-slate-950 rounded-xl overflow-hidden border-2 flex items-center justify-center checkered-bg ${isSelected ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-slate-800 hover:border-slate-600'}`}>
                      <style jsx>{`.checkered-bg { background-image: linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;}`}</style>
                      
                      {isLoading ? (
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      ) : (
                        <img 
                          src={url as string} 
                          alt={stepId} 
                          className="max-w-full max-h-full object-contain cursor-zoom-in transition-transform duration-300 hover:scale-105" 
                          onClick={() => setFullScreenImage(url as string)}
                        />
                      )}
                      
                      {!isLoading && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between pointer-events-none">
                          <div className="flex justify-between items-start pointer-events-auto">
                            <button onClick={() => togglePhotoSelection(stepId)} className="text-white p-1 hover:text-emerald-400">{isSelected ? <CheckCircle2 className="w-7 h-7 text-emerald-500 fill-white" /> : <Circle className="w-7 h-7" />}</button>
                            
                            <div className="flex gap-2 bg-black/60 rounded-lg p-1 border border-white/10">
                              {/* NOWOŚĆ: Ikonka pobierania */}
                              <button onClick={() => handleDownloadPhoto(url as string, stepId)} className="p-1.5 text-slate-300 hover:text-indigo-400" title="Pobierz to zdjęcie"><Download className="w-5 h-5" /></button>
                              
                              {hasHistory && (
                                <button onClick={() => handleUndoPhoto(stepId)} className="p-1.5 text-slate-300 hover:text-amber-400" title="Cofnij ostatnią zmianę"><Undo2 className="w-5 h-5" /></button>
                              )}
                              <button onClick={() => setFullScreenImage(url as string)} className="p-1.5 text-slate-300 hover:text-blue-400" title="Powiększ"><ZoomIn className="w-5 h-5" /></button>
                              <button onClick={() => initReplacePhoto(stepId)} className="p-1.5 text-slate-300 hover:text-emerald-400" title="Podmień z aparatu"><Camera className="w-5 h-5" /></button>
                              <button onClick={() => handleDeletePhoto(stepId, url as string)} className="p-1.5 text-slate-300 hover:text-rose-400" title="Usuń zdjęcie"><Trash2 className="w-5 h-5" /></button>
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