'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Car, Calendar, Loader2, LogOut, LayoutGrid, Building2, ExternalLink, Users, Hash, List, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Vehicle {
  id: string;
  vin: string;
  plate?: string;
  brand?: string;
  model?: string;
  dealerId: string;
  status: string;
  photos?: Record<string, string>;
  completedAt?: any;
}

export default function DashboardPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isMounted, setIsMounted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedView = localStorage.getItem('saas_dashboard_view');
    if (savedView === 'table' || savedView === 'grid') {
      setViewMode(savedView);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = '/login'; 
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          setUserData(uData);
          await fetchVehicles(uData.role === 'superadmin' ? null : uData.dealerId);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchVehicles = async (dealerId: string | null) => {
    try {
      const vehiclesRef = collection(db, 'vehicles');
      const q = dealerId ? query(vehiclesRef, where('dealerId', '==', dealerId)) : vehiclesRef;
      
      const snap = await getDocs(q);
      const list: Vehicle[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Vehicle));
      
      list.sort((a, b) => {
        const dateA = a.completedAt?.seconds || 0;
        const dateB = b.completedAt?.seconds || 0;
        return dateB - dateA;
      });
      
      setVehicles(list);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  const toggleViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('saas_dashboard_view', mode);
  };

  // --- TWORZENIE NOWEJ KARTOTEKI ---
  const handleCreateRecord = async () => {
    setIsCreating(true);
    try {
      const currentDealerId = userData?.role === 'superadmin' ? 'nivette' : userData?.dealerId;
      
      if (!currentDealerId) {
        alert("Brak przypisanego salonu!");
        setIsCreating(false);
        return;
      }

      const newDocRef = doc(collection(db, 'vehicles'));
      await setDoc(newDocRef, {
        dealerId: currentDealerId,
        status: 'Oczekuje',
        brand: 'Nowy',
        model: 'Pojazd',
        completedAt: serverTimestamp()
      });

      router.push(`/dashboard/vehicle/${newDocRef.id}`);
    } catch (error) {
      console.error(error);
      alert("Błąd podczas tworzenia kartoteki");
      setIsCreating(false);
    }
  };

  // --- SZYBKIE USUWANIE Z LISTY ---
  const handleDeleteRecord = async (e: React.MouseEvent, vehicleId: string) => {
    e.preventDefault(); // Zapobiega przejściu do detali po kliknięciu w kosz
    e.stopPropagation();
    
    if (!confirm('Czy na pewno chcesz usunąć tę kartotekę?')) return;

    try {
      await deleteDoc(doc(db, 'vehicles', vehicleId));
      setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    } catch (error) {
      console.error(error);
      alert("Nie udało się usunąć kartoteki.");
    }
  };

  if (loading || !isMounted) return <div className="min-h-screen bg-slate-900 flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Centrala SaaS</h1>
            <p className="text-xs text-slate-400">
              Rola: <span className="text-emerald-400 font-medium uppercase">{userData?.role}</span>
              {userData?.dealerId && ` | Dealer: ${userData.dealerId}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {userData?.role === 'superadmin' && (
            <Link href="/admin/dealers" className="text-sm text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700">
              <Building2 className="w-4 h-4" /> Panel SuperAdmina
            </Link>
          )}
          {userData?.role === 'admin' && (
            <Link href="/dashboard/team" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700">
              <Users className="w-4 h-4" /> Mój Zespół
            </Link>
          )}
          <button onClick={handleLogout} className="text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors p-2">
            <LogOut className="w-4 h-4" /> Wyloguj
          </button>
        </div>
      </header>

      <main className="p-6 md:p-12 max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h2 className="text-2xl font-bold">Ostatnie Sesje Zdjęciowe</h2>
            <p className="text-sm text-slate-400 mt-1">Podgląd na żywo z placów dealerskich</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => toggleViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => toggleViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* ZMIANA: Uniwersalny przycisk + Nowa Kartoteka */}
            <button 
              onClick={handleCreateRecord}
              disabled={isCreating}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
              Nowa Kartoteka
            </button>
          </div>
        </div>

        {vehicles.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 border-dashed rounded-2xl p-12 text-center text-slate-400">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Brak zrealizowanych sesji zdjęciowych.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((vehicle) => {
              const firstPhotoUrl = vehicle.photos ? Object.values(vehicle.photos)[0] : null;
              
              return (
                <Link 
                  href={`/dashboard/vehicle/${vehicle.id}`} 
                  key={vehicle.id} 
                  className="block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all group cursor-pointer relative"
                >
                  {/* Przycisk usuwania w kafelku */}
                  <button 
                    onClick={(e) => handleDeleteRecord(e, vehicle.id)}
                    className="absolute top-3 left-3 z-20 p-2 bg-black/60 hover:bg-rose-500/80 backdrop-blur-md rounded-full text-white/50 hover:text-white transition-colors border border-white/10 opacity-0 group-hover:opacity-100"
                    title="Usuń kartotekę"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {firstPhotoUrl ? (
                      <img src={firstPhotoUrl} alt="Vehicle thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Car className="w-10 h-10 text-slate-800" />
                    )}
                    <div className="absolute top-3 right-3 z-10">
                      <span className="bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border border-white/10">
                        {vehicle.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs text-emerald-400 font-bold mb-1 tracking-wider uppercase">
                          {vehicle.dealerId}
                        </div>
                        <h3 className="font-bold text-lg text-white truncate max-w-[220px]">
                          {vehicle.brand && vehicle.brand !== 'Brak' ? `${vehicle.brand} ${vehicle.model}` : `ID: ${vehicle.id}`}
                        </h3>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mt-4 text-sm text-slate-400">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4" /> {vehicle.plate && vehicle.plate !== 'Brak' ? vehicle.plate : 'Brak tablicy'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4" /> VIN: {vehicle.vin}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> 
                        {vehicle.completedAt ? new Date(vehicle.completedAt.seconds * 1000).toLocaleString('pl-PL') : 'Brak danych'}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-950/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4 w-24">Miniatura</th>
                    <th className="px-6 py-4">Pojazd</th>
                    <th className="px-6 py-4">Dane Rejestracyjne</th>
                    <th className="px-6 py-4">Oddział / Data</th>
                    <th className="px-6 py-4 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                  {vehicles.map((vehicle) => {
                    const firstPhotoUrl = vehicle.photos ? Object.values(vehicle.photos)[0] : null;
                    return (
                      <tr 
                        key={vehicle.id} 
                        onClick={() => router.push(`/dashboard/vehicle/${vehicle.id}`)}
                        className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-3">
                          <div className="w-20 h-14 bg-slate-950 rounded border border-slate-800 overflow-hidden group-hover:border-emerald-500/30 transition-colors flex items-center justify-center relative">
                            {firstPhotoUrl ? (
                              <img src={firstPhotoUrl} alt="Thumb" className="w-full h-full object-cover" />
                            ) : (
                              <Car className="w-5 h-5 text-slate-700" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="font-bold text-white text-base mb-0.5">
                            {vehicle.brand && vehicle.brand !== 'Brak' ? `${vehicle.brand} ${vehicle.model}` : `Nowy Pojazd`}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">ID: {vehicle.id}</div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-xs font-mono font-bold text-emerald-400">
                              {vehicle.plate && vehicle.plate !== 'Brak' ? vehicle.plate : '---'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            VIN: {vehicle.vin}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">{vehicle.dealerId}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {vehicle.completedAt ? new Date(vehicle.completedAt.seconds * 1000).toLocaleString('pl-PL') : 'Brak daty'}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full inline-block">
                              {vehicle.status}
                            </span>
                            {/* Przycisk usuwania w tabeli */}
                            <button 
                              onClick={(e) => handleDeleteRecord(e, vehicle.id)}
                              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Usuń kartotekę"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}