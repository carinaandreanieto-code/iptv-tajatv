import { useState, useEffect } from "react";
import { 
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  query, where, orderBy, limit, Timestamp 
} from "firebase/firestore";
import { signInWithPopup, signOut } from "firebase/auth";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "../lib/firebase";
import { Customer, Channel, Pack, Ad, UserStatus } from "../types";
import { 
  Users, Tv, Package, Megaphone, BarChart3, 
  Plus, Search, Edit2, Trash2, ShieldCheck, 
  LogOut, RefreshCw, ChevronRight, X, 
  Calendar, CheckCircle2, AlertCircle, FileDown
} from "lucide-react";
import axios from "axios";
// @ts-ignore
import { Parser } from 'm3u8-parser';

import { motion, AnimatePresence } from "motion/react";

interface AdminProps {
  onBack: () => void;
}

type Tab = "clientes" | "iptv" | "packs" | "publicidad" | "metricas";

export default function Admin({ onBack }: AdminProps) {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("clientes");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user?.email === "carinaandreanieto@gmail.com") {
        setIsAdminLoggedIn(true);
        fetchData();
      } else {
        setIsAdminLoggedIn(false);
      }
      setIsAuthLoading(false);
    });
    return unsub;
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const custSnap = await getDocs(collection(db, "customers"));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
      
      const chanSnap = await getDocs(collection(db, "channels"));
      setChannels(chanSnap.docs.map(d => ({ id: d.id, ...d.data() } as Channel)));

      const packSnap = await getDocs(collection(db, "packs"));
      setPacks(packSnap.docs.map(d => ({ id: d.id, ...d.data() } as Pack)));

      const adsSnap = await getDocs(collection(db, "ads"));
      setAds(adsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ad)));
    } catch (err) {
      console.error("Data load error", err);
    }
  };

  const handleAdminLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login Error", err);
    }
  };

  const handleM3U8Import = async (url: string) => {
    try {
      // Usar el proxy para evitar problemas de CORS
      const response = await axios.get(`/api/proxy-m3u?url=${encodeURIComponent(url)}`);
      
      const lines = response.data.split('\n');
      const newChannels: Omit<Channel, 'id'>[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF')) {
          const info = line;
          const nameMatch = info.match(/,(.*)$/);
          const logoMatch = info.match(/tvg-logo="(.*?)"/);
          const groupMatch = info.match(/group-title="(.*?)"/);
          
          const streamUrl = lines[i+1]?.trim();
          if (streamUrl && !streamUrl.startsWith('#')) {
            newChannels.push({
              name: nameMatch ? nameMatch[1].trim() : 'Canal sin nombre',
              logo: logoMatch ? logoMatch[1] : '',
              category: groupMatch ? groupMatch[1] : 'General',
              url: streamUrl
            });
          }
        }
      }

      if (newChannels.length === 0) {
        alert("No se encontraron canales válidos en la lista. Asegúrese de que sea un formato M3U estándar.");
        return;
      }

      // Guardar en Firestore (limitado a 100 para evitar bloqueos)
      const toImport = newChannels.slice(0, 100);
      for (const chan of toImport) {
        await addDoc(collection(db, "channels"), chan);
      }
      
      fetchData();
      alert(`¡Éxito! Se han importado ${toImport.length} canales (máximo 100 por vez).`);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Import error", err);
      alert("Error al importar M3U8. Verifique que la URL sea válida y accesible.");
    }
  };

  const renewCustomer = async (id: string) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;
    const newExp = new Date();
    newExp.setDate(newExp.getDate() + 30);
    await updateDoc(doc(db, "customers", id), {
      expirationDate: newExp.toISOString(),
      status: UserStatus.ACTIVE
    });
    fetchData();
  };

  const exportToExcel = () => {
    const csvRows = [
      ["Nombre", "Numero", "Telefono", "Status", "Vencimiento"].join(",")
    ];
    customers.forEach(c => {
      csvRows.push([c.name, c.customerNumber, c.phone || "", c.status, c.expirationDate].join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_tajatv_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const toggleCustomerStatus = async (id: string, currentStatus: UserStatus) => {
    const newStatus = currentStatus === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    await updateDoc(doc(db, "customers", id), {
      status: newStatus
    });
    fetchData();
  };

  const handleSaveCustomer = async (data: any) => {
    if (editingItem) {
      await updateDoc(doc(db, "customers", editingItem.id), data);
    } else {
      await addDoc(collection(db, "customers"), data);
    }
    setIsModalOpen(false);
    setEditingItem(null);
    fetchData();
  };

  if (isAuthLoading) return null;

  if (!isAdminLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6 text-center">
        <div className="max-w-sm space-y-8">
           <div className="space-y-4">
              <div className="w-20 h-20 bg-red-600/10 rounded-3xl flex items-center justify-center mx-auto border border-red-600/20">
                 <ShieldCheck className="w-10 h-10 text-red-600" />
              </div>
              <h1 className="text-3xl font-black text-white">Panel de Control</h1>
              <p className="text-gray-500 text-sm">Este acceso está reservado únicamente para administradores autorizados de TajaTV.</p>
           </div>
           
           <button 
             onClick={handleAdminLogin}
             className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-gray-200 transition-all flex items-center justify-center gap-3"
           >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" />
              Ingresar con Google
           </button>
           <button onClick={onBack} className="text-gray-500 text-xs hover:text-white transition-colors">Volver al Inicio</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] flex">
      {/* Sidebar */}
      <aside className="w-72 bg-[#0d0d0d] border-r border-gray-800 flex flex-col">
        <div className="p-8">
           <h2 className="text-2xl font-black text-red-600 mb-1">TajaTV</h2>
           <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-none">Administración v1.1</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <NavItem active={activeTab === "clientes"} icon={Users} label="Clientes" onClick={() => setActiveTab("clientes")} />
          <NavItem active={activeTab === "iptv"} icon={Tv} label="Gestión IPTV" onClick={() => setActiveTab("iptv")} />
          <NavItem active={activeTab === "packs"} icon={Package} label="Packs" onClick={() => setActiveTab("packs")} />
          <NavItem active={activeTab === "publicidad"} icon={Megaphone} label="Publicidad" onClick={() => setActiveTab("publicidad")} />
          <NavItem active={activeTab === "metricas"} icon={BarChart3} label="Métricas" onClick={() => setActiveTab("metricas")} />
        </nav>

        <div className="p-6 border-t border-gray-800 space-y-4">
           <div className="flex items-center gap-3">
              <img src={auth.currentUser?.photoURL || ""} className="w-10 h-10 rounded-xl" />
              <div className="min-w-0">
                 <p className="text-xs font-bold text-white truncate">{auth.currentUser?.displayName}</p>
                 <p className="text-[10px] text-gray-500 truncate">Administrador</p>
              </div>
           </div>
           <button 
             onClick={() => signOut(auth)}
             className="w-full flex items-center justify-center gap-2 p-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl transition-all font-bold text-xs"
           >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto max-h-screen">
        <div className="flex items-center justify-between mb-10">
           <div>
              <h3 className="text-3xl font-black text-white capitalize">{activeTab}</h3>
              <p className="text-gray-500 text-sm mt-1">Gestiona y monitorea los recursos de tu plataforma.</p>
           </div>
           <div className="flex items-center gap-4">
              <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                 <input 
                   value={search} 
                   onChange={(e) => setSearch(e.target.value)}
                   className="bg-[#121212] border border-gray-800 rounded-xl pl-12 pr-6 py-3 text-sm text-white focus:ring-1 focus:ring-red-600 outline-none w-64 transition-all"
                   placeholder="Buscar..."
                 />
              </div>
              <button 
                onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl shadow-lg shadow-red-600/20 transition-all"
              >
                 <Plus className="w-6 h-6" />
              </button>
           </div>
        </div>

        {activeTab === "clientes" && (
           <div className="space-y-6">
              <div className="flex gap-4">
                <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600/10 text-green-500 rounded-lg text-xs font-bold border border-green-600/20 hover:bg-green-600/20 transition-all">
                  <FileDown className="w-4 h-4" /> Exportar Tabla
                </button>
              </div>
              <div className="bg-[#0d0d0d] border border-gray-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#121212] border-b border-gray-800">
                    <tr>
                      <th className="px-6 py-4 font-bold text-gray-400">Cliente</th>
                      <th className="px-6 py-4 font-bold text-gray-400">Número</th>
                      <th className="px-6 py-4 font-bold text-gray-400">Status</th>
                      <th className="px-6 py-4 font-bold text-gray-400">Vencimiento</th>
                      <th className="px-6 py-4 font-bold text-gray-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.customerNumber.includes(search)).map((c) => (
                      <tr key={c.id} className="border-b border-gray-800 hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center font-black text-gray-400">
                              {c.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white">{c.name}</p>
                              <p className="text-[10px] text-gray-500">{c.phone || 'Sin télefono'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-mono text-gray-400">{c.customerNumber}</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            c.status === UserStatus.ACTIVE ? "bg-green-600/10 text-green-500 border border-green-600/20" : "bg-red-600/10 text-red-500 border border-red-600/20"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <p className={`font-medium ${new Date(c.expirationDate) < new Date() ? "text-red-500" : "text-gray-400"}`}>
                            {new Date(c.expirationDate).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => { setEditingItem(c); setIsModalOpen(true); }} 
                              className="p-2 bg-gray-600/10 text-gray-400 hover:bg-gray-600/20 rounded-lg transition-all" 
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => toggleCustomerStatus(c.id!, c.status)} 
                              className={`p-2 rounded-lg transition-all ${c.status === UserStatus.ACTIVE ? "bg-red-600/10 text-red-500 hover:bg-red-600/20" : "bg-green-600/10 text-green-500 hover:bg-green-600/20"}`} 
                              title={c.status === UserStatus.ACTIVE ? "Desactivar" : "Activar"}
                            >
                              {c.status === UserStatus.ACTIVE ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                            <button onClick={() => renewCustomer(c.id!)} className="p-2 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 rounded-lg transition-all" title="Renovar 30 días">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button onClick={async () => { if(confirm('¿Seguro?')) { await deleteDoc(doc(db, 'customers', c.id!)); fetchData(); } }} className="p-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 rounded-lg transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        )}

        {activeTab === "iptv" && (
           <div className="space-y-6">
              <div className="bg-[#0d0d0d] border border-gray-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#121212] border-b border-gray-800">
                    <tr>
                      <th className="px-6 py-4 font-bold text-gray-400">Canal</th>
                      <th className="px-6 py-4 font-bold text-gray-400">Categoría</th>
                      <th className="px-6 py-4 font-bold text-gray-400">URL</th>
                      <th className="px-6 py-4 font-bold text-gray-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => (
                      <tr key={c.id} className="border-b border-gray-800 hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg border border-gray-800 flex items-center justify-center overflow-hidden">
                              {c.logo ? <img src={c.logo} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Tv className="w-5 h-5 text-gray-700" />}
                            </div>
                            <p className="font-bold text-white">{c.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">{c.category}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-gray-600 truncate max-w-xs font-mono">{c.url}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={async () => { if(confirm('¿Eliminar canal?')) { await deleteDoc(doc(db, 'channels', c.id!)); fetchData(); } }} className="p-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {channels.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-600 italic">
                          No hay canales cargados. Usa el botón "+" para importar una lista M3U.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        )}

        {activeTab === "packs" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packs.map(pack => (
              <div key={pack.id} className="bg-[#0d0d0d] border border-gray-800 rounded-2xl p-6 space-y-4 hover:border-red-600/30 transition-all group">
                <div className="flex items-center justify-between">
                   <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-red-600" />
                   </div>
                   <button onClick={async () => { if(confirm('¿Borrar pack?')) { await deleteDoc(doc(db, 'packs', pack.id)); fetchData(); } }} className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                   </button>
                </div>
                <div>
                   <h4 className="text-xl font-bold text-white">{pack.name}</h4>
                   <p className="text-xs text-gray-500 mt-1 uppercase font-black tracking-widest">{pack.channels.length} CANALES ASIGNADOS</p>
                </div>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                   {pack.channels.map(cid => {
                      const channel = channels.find(ch => ch.id === cid);
                      return (
                         <span key={cid} className="text-[10px] bg-white/5 border border-white/5 px-2 py-1 rounded text-gray-400">
                            {channel?.name || 'Cargando...'}
                         </span>
                      );
                   })}
                </div>
              </div>
            ))}
            {packs.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4">
                 <Package className="w-12 h-12 text-gray-800 mx-auto" />
                 <p className="text-gray-600 italic">No tienes packs creados. Crea uno para agrupar canales.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "metricas" && (
           <MetricsView channels={channels} />
        )}

        {activeTab === "publicidad" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ads.map(ad => (
              <div key={ad.id} className="bg-[#0d0d0d] border border-gray-800 rounded-2xl overflow-hidden group">
                <div className="aspect-video relative">
                  <img src={ad.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button onClick={async () => { if(confirm('¿Borrar anuncio?')) { await deleteDoc(doc(db, 'ads', ad.id)); fetchData(); } }} className="p-2 bg-black/60 hover:bg-red-600 rounded-lg text-white transition-all opacity-100 lg:opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-5 space-y-2">
                   <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white">{ad.title}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${ad.active ? 'bg-green-600/10 text-green-500' : 'bg-gray-800 text-gray-500'}`}>
                        {ad.active ? 'Activo' : 'Pausado'}
                      </span>
                   </div>
                   <p className="text-sm text-gray-500 line-clamp-2">{ad.text}</p>
                   <p className="text-[10px] text-gray-600 font-mono">WA: {ad.whatsappNumber}</p>
                </div>
              </div>
            ))}
            {ads.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-600 italic">No hay anuncios configurados.</div>
            )}
          </div>
        )}

        {/* Modal simplified for prototype */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#121212] border border-gray-800 w-full max-w-lg rounded-3xl p-10 space-y-8"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-2xl font-black text-white">
                  {editingItem ? 'Editar' : 'Nuevo/a'} {activeTab === 'clientes' ? 'Cliente' : activeTab === 'iptv' ? 'Lista M3U' : activeTab === 'packs' ? 'Pack' : 'Anuncio'}
                </h4>
                <button onClick={() => setIsModalOpen(false)}><X className="w-6 h-6 text-gray-500" /></button>
              </div>

              {activeTab === "iptv" ? (
                <M3U8Form onImport={handleM3U8Import} />
              ) : activeTab === "clientes" ? (
                <CustomerForm initialData={editingItem} onSave={handleSaveCustomer} packs={packs} />
              ) : activeTab === "packs" ? (
                <PackForm channels={channels} onSave={async (data) => {
                  await addDoc(collection(db, "packs"), data);
                  setIsModalOpen(false);
                  fetchData();
                }} />
              ) : activeTab === "publicidad" ? (
                <AdForm onSave={async (data) => {
                  await addDoc(collection(db, "ads"), data);
                  setIsModalOpen(false);
                  fetchData();
                }} />
              ) : (
                <p className="text-gray-500 italic text-center">Formulario en desarrollo para esta sección.</p>
              )}
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, icon: Icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm ${
        active 
          ? "bg-red-600 text-white shadow-xl shadow-red-600/20" 
          : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
      }`}
    >
      <Icon className={`w-5 h-5 ${active ? "animate-pulse" : ""}`} />
      {label}
    </button>
  );
}

function AdForm({ onSave }: any) {
  const [form, setForm] = useState({
    title: "",
    text: "",
    imageUrl: "",
    whatsappNumber: "",
    active: true
  });

  return (
    <div className="space-y-6">
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Título del Anuncio</label>
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white" placeholder="Ej: ¡Nuevo contenido!" />
       </div>
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Texto Informativo</label>
          <textarea value={form.text} onChange={e => setForm({...form, text: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white h-24" placeholder="Descripción breve..." />
       </div>
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">URL de Imagen (JPG/PNG)</label>
          <input value={form.imageUrl} onChange={e => setForm({...form, imageUrl: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white font-mono text-xs" placeholder="https://..." />
       </div>
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Número WhatsApp (Internacional)</label>
          <input value={form.whatsappNumber} onChange={e => setForm({...form, whatsappNumber: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white" placeholder="54911..." />
       </div>
       <div className="flex items-center gap-3">
          <input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} className="w-5 h-5 rounded accent-red-600" />
          <label className="text-sm text-gray-400 font-bold">Publicar inmediatamente</label>
       </div>
       <button onClick={() => onSave(form)} disabled={!form.title || !form.imageUrl} className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50">
          Guardar Anuncio
       </button>
    </div>
  );
}

function PackForm({ channels, onSave }: any) {
  const [name, setName] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [searchChan, setSearchChan] = useState("");

  const filteredChannels = channels.filter((c: any) => 
    c.name.toLowerCase().includes(searchChan.toLowerCase())
  );

  return (
    <div className="space-y-6">
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Nombre del Pack</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-1 focus:ring-red-600" placeholder="Ej: Premium Deportes" />
       </div>
       <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-500 uppercase">Seleccionar Canales ({selectedChannels.length})</label>
            <input 
              placeholder="Filtrar canales..." 
              value={searchChan} 
              onChange={e => setSearchChan(e.target.value)}
              className="bg-transparent border-b border-gray-800 text-[10px] outline-none px-2 py-1 text-gray-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2 p-1 border border-gray-800 rounded-xl bg-[#0a0a0a]">
             {filteredChannels.map((c: any) => (
                <button 
                  key={c.id} 
                  onClick={() => {
                    const next = selectedChannels.includes(c.id) ? selectedChannels.filter(id => id !== c.id) : [...selectedChannels, c.id];
                    setSelectedChannels(next);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all border ${
                    selectedChannels.includes(c.id) ? "bg-red-600 border-red-600 text-white" : "bg-[#121212] border-gray-800 text-gray-500"
                  }`}
                >
                   <div className="w-6 h-6 rounded bg-black/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {c.logo ? <img src={c.logo} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <Tv size={12} />}
                   </div>
                   <span className="text-[10px] font-bold truncate">{c.name}</span>
                </button>
             ))}
          </div>
       </div>
       <button 
         onClick={() => onSave({ name, channels: selectedChannels })} 
         disabled={!name || selectedChannels.length === 0}
         className="w-full bg-red-600 text-white font-black py-4 rounded-xl disabled:opacity-50"
       >
          Crear Pack
       </button>
    </div>
  );
}

function MetricsView({ channels }: { channels: Channel[] }) {
  const [metrics, setMetrics] = useState<any[]>([]);
  
  useEffect(() => {
    getDocs(query(collection(db, "metrics"), orderBy("timestamp", "desc"), limit(50))).then(snap => {
      setMetrics(snap.docs.map(d => d.data()));
    });
  }, []);

  const topChannels = Object.entries(
    metrics.reduce((acc: any, m: any) => {
      acc[m.channelId] = (acc[m.channelId] || 0) + 1;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
       <div className="bg-[#0d0d0d] border border-gray-800 rounded-2xl p-8 space-y-6">
          <h5 className="font-black text-gray-400 uppercase tracking-widest text-xs">Canales más vistos</h5>
          <div className="space-y-4">
             {topChannels.map(([id, count]: any) => {
                const chan = channels.find(c => c.id === id);
                return (
                   <div key={id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-[#121212] rounded-lg border border-gray-800 flex items-center justify-center overflow-hidden">
                            {chan?.logo && <img src={chan.logo} className="w-full h-full object-contain" referrerPolicy="no-referrer" />}
                         </div>
                         <p className="font-bold text-white">{chan?.name || 'Canal Desconocido'}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xl font-black text-red-600">{count}</p>
                         <p className="text-[10px] text-gray-500 font-bold">VISTAS</p>
                      </div>
                   </div>
                );
             })}
          </div>
       </div>

       <div className="bg-[#0d0d0d] border border-gray-800 rounded-2xl p-8 space-y-6">
          <h5 className="font-black text-gray-400 uppercase tracking-widest text-xs">Últimas Conexiones</h5>
          <div className="space-y-4">
             {metrics.slice(0, 8).map((m: any, idx) => {
                const chan = channels.find(c => c.id === m.channelId);
                return (
                   <div key={idx} className="flex items-center justify-between border-b border-gray-800 pb-3 last:border-0 last:pb-0">
                      <div>
                         <p className="text-xs font-bold text-white">Usuario: {m.userId}</p>
                         <p className="text-[10px] text-gray-600">Sintonizó {chan?.name || 'un canal'}</p>
                      </div>
                      <p className="text-[10px] text-gray-500 font-mono">{new Date(m.timestamp).toLocaleTimeString()}</p>
                   </div>
                );
             })}
          </div>
       </div>
    </div>
  );
}

function M3U8Form({ onImport }: any) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async () => {
    setIsLoading(true);
    await onImport(url);
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">URL de Lista M3U8</label>
          <input 
            value={url} onChange={e => setUrl(e.target.value)}
            disabled={isLoading}
            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-5 py-4 text-white focus:ring-1 focus:ring-red-600 outline-none disabled:opacity-50"
            placeholder="https://servidor.com/lista.m3u"
          />
       </div>
       <button 
         onClick={handleAction} 
         disabled={isLoading || !url}
         className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
       >
          {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
          {isLoading ? "Procesando..." : "Procesar Contenido"}
       </button>
    </div>
  );
}

function CustomerForm({ initialData, onSave, packs }: any) {
  const [form, setForm] = useState(initialData || {
    name: "",
    customerNumber: Math.floor(100000 + Math.random() * 900000).toString(),
    password: "pass" + Math.floor(1000 + Math.random() * 9000),
    phone: "",
    status: UserStatus.ACTIVE,
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    assignedPacks: [] as string[]
  });

  return (
    <div className="space-y-6">
       <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase">Nombre</label>
             <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white" />
          </div>
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label>
             <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white" />
          </div>
       </div>
       <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase text-red-500">ID Usuario (Auto)</label>
             <input readOnly value={form.customerNumber} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-gray-500 font-mono" />
          </div>
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase text-red-500">Pass temporal</label>
             <input readOnly value={form.password} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-gray-500 font-mono" />
          </div>
       </div>
       <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase">Estado</label>
             <select 
               value={form.status} 
               onChange={e => setForm({...form, status: e.target.value as UserStatus})}
               className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white outline-none"
             >
                <option value={UserStatus.ACTIVE}>Activo</option>
                <option value={UserStatus.INACTIVE}>Inactivo</option>
             </select>
          </div>
          <div className="space-y-2">
             <label className="text-xs font-bold text-gray-500 uppercase">Vencimiento</label>
             <input 
               type="date"
               value={form.expirationDate.split('T')[0]} 
               onChange={e => setForm({...form, expirationDate: new Date(e.target.value).toISOString()})} 
               className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white" 
             />
          </div>
       </div>
       <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Packs Habilitados</label>
          <div className="flex flex-wrap gap-2">
             {packs.map((p: any) => (
                <button 
                  key={p.id}
                  onClick={() => {
                    const next = form.assignedPacks.includes(p.name) ? form.assignedPacks.filter(i => i !== p.name) : [...form.assignedPacks, p.name];
                    setForm({...form, assignedPacks: next});
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${form.assignedPacks.includes(p.name) ? "bg-red-600 border-red-600 text-white" : "border-gray-800 text-gray-600"}`}
                >
                   {p.name}
                </button>
             ))}
          </div>
       </div>
       <button onClick={() => onSave(form)} className="w-full bg-white text-black font-black py-4 rounded-xl">
          {initialData ? "Actualizar Cliente" : "Guardar Cliente"}
       </button>
    </div>
  );
}
