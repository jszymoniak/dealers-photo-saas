'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Car, Calendar, Loader2, LogOut, LayoutGrid, Building2, ExternalLink, Users } from 'lucide-react';
import Link from 'next/link';

interface Vehicle {
  id: string;
  vin: string;
  dealerId: string;
  status: string;
  photos?: Record<string, string>;
  completedAt?: any;
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
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
          // Pobieramy pojazdy na podstawie roli
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
      // Jeśli mamy SuperAdmina (dealerId jest null), pobieramy wszystkie pojazdy. 
      // W przeciwnym razie filtrujemy tylko dla zalogowanego dealera.
      const q = dealerId ? query(vehiclesRef, where('dealerId', '==', dealerId)) : vehiclesRef;
      
      const snap = await getDocs(q);
      const list: Vehicle[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Vehicle));
      setVehicles(list);
    } catch (err) {
      console.error(err);
    }
  };

 const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Górna belka nawigacyjna */}
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

      {/* Główny kontener */}
      <main className="p-6 md:p-12 max-w-7xl mx-auto space-y-8">
        
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold">Ostatnie Sesje Zdjęciowe</h2>
            <p className="text-sm text-slate-400 mt-1">Podgląd na żywo z placów dealerskich</p>
          </div>
          {/* Przycisk do testowego odpalenia aparatu dla SuperAdmina */}
          {userData?.role === 'superadmin' && (
             <Link href="/session/TEST-VIN-456" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
                Aparat (Nowe Auto) <ExternalLink className="w-4 h-4" />
             </Link>
          )}
        </div>

        {vehicles.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 border-dashed rounded-2xl p-12 text-center text-slate-400">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Brak zrealizowanych sesji zdjęciowych.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((vehicle) => {
              // Pobieramy pierwsze zdjęcie z dostępnych, by zrobić miniaturkę
              const firstPhotoUrl = vehicle.photos ? Object.values(vehicle.photos)[0] : null;
              
              return (
                <div key={vehicle.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors shadow-lg group">
                  {/* Sekcja miniatury */}
                  <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {firstPhotoUrl ? (
                      <img src={firstPhotoUrl} alt="Vehicle thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Car className="w-10 h-10 text-slate-800" />
                    )}
                    {/* Nakładka statusu */}
                    <div className="absolute top-3 right-3">
                      <span className="bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border border-white/10">
                        {vehicle.status}
                      </span>
                    </div>
                  </div>
                  
                  {/* Sekcja danych */}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs text-emerald-400 font-bold mb-1 tracking-wider uppercase">
                          {vehicle.dealerId}
                        </div>
                        <h3 className="font-bold text-lg text-white">ID: {vehicle.id}</h3>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mt-4 text-sm text-slate-400">
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4" /> VIN: {vehicle.vin}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> 
                        Data: {vehicle.completedAt ? new Date(vehicle.completedAt.seconds * 1000).toLocaleString('pl-PL') : 'Brak danych'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}