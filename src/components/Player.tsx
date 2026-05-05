import { useState, useEffect, useRef, useMemo } from "react";
import { collection, getDocs, addDoc, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Customer, Channel, Pack, Metric } from "../types";
import Hls from "hls.js";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, Pause, Volume2, List, Settings, 
  LogOut, Tv, ChevronRight, ChevronLeft,
  Loader2, Maximize, AlertCircle, Smartphone
} from "lucide-react";

interface PlayerProps {
  customer: Customer;
  onLogout: () => void;
}

export default function Player({ customer, onLogout }: PlayerProps) {
  const [deviceMode, setDeviceMode] = useState<"mobile" | "tv">("tv");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;
    const timer = setTimeout(() => {
      if (deviceMode === "tv" && !sidebarOpen) {
         setShowControls(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [showControls, sidebarOpen, deviceMode]);

  // Handle auto-mode
  useEffect(() => {
    if (window.innerWidth < 768) {
      setDeviceMode("mobile");
      setSidebarOpen(false);
    }
  }, []);

  // Fetch channels based on customer packs
  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        // Get all packs assigned to customer
        const packsSnap = await getDocs(collection(db, "packs"));
        const customerPacks = packsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Pack))
          .filter(p => customer.assignedPacks.includes(p.name) || customer.assignedPacks.includes(p.id));

        const allowedChannelIds = new Set<string>();
        customerPacks.forEach(p => p.channels.forEach(cid => allowedChannelIds.add(cid)));

        // Get all channels
        const channelsSnap = await getDocs(collection(db, "channels"));
        const allChannels = channelsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Channel));
        
        // Filter by permissions
        const allowedChannels = allChannels.filter(c => allowedChannelIds.has(c.id) || allowedChannelIds.has(c.name));
        
        setChannels(allowedChannels);
        if (allowedChannels.length > 0) {
          const lastId = localStorage.getItem(`lastChannel_${customer.customerNumber}`);
          const lastChannel = allowedChannels.find(c => c.id === lastId);
          setCurrentChannel(lastChannel || allowedChannels[0]);
        }
      } catch (err) {
        console.error("Error loading content", err);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [customer]);

  // Handle Video Playback
  useEffect(() => {
    if (!currentChannel || !videoRef.current) return;
    setVideoError(false);

    const video = videoRef.current;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls({
        startLevel: -1,
        enableWorker: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 5,
      });
      hlsRef.current = hls;
      hls.loadSource(currentChannel.url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setVideoError(false);
        video.play().catch(e => {
          console.log("Autoplay blocked, waiting for interaction", e);
        });
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error("HLS Error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("Fatal network error, trying to recover...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("Fatal media error, trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              console.error("Unrecoverable error");
              setVideoError(true);
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentChannel.url;
      video.addEventListener('loadedmetadata', () => {
        video.play();
      });
      video.addEventListener('error', () => {
        setVideoError(true);
      });
    }

    // Log Metric
    addDoc(collection(db, "metrics"), {
      channelId: currentChannel.id,
      userId: customer.customerNumber,
      timestamp: new Date().toISOString()
    });

    // Save for persistence
    localStorage.setItem(`lastChannel_${customer.customerNumber}`, currentChannel.id);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [currentChannel]);

  // TV Navigation Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewingItems.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          setFocusedIndex(prev => (prev + 1) % viewingItems.length);
          break;
        case "ArrowUp":
          setFocusedIndex(prev => (prev - 1 + viewingItems.length) % viewingItems.length);
          break;
        case "Enter":
          setCurrentChannel(viewingItems[focusedIndex]);
          break;
        case "ArrowRight":
          setSidebarOpen(false);
          break;
        case "ArrowLeft":
          setSidebarOpen(true);
          break;
        case "Escape":
          setSidebarOpen(!sidebarOpen);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [channels, focusedIndex, sidebarOpen, selectedCategory]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(channels.map(c => c.category)));
    return ["Todos", ...cats];
  }, [channels]);

  const viewingItems = useMemo(() => {
    return channels.filter(c => selectedCategory === "Todos" || c.category === selectedCategory);
  }, [channels, selectedCategory]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
          <p className="text-gray-500 font-medium">Buscando señal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex overflow-hidden relative bg-black ${deviceMode === "mobile" ? "flex-col" : "flex-row"}`}>
      {/* Sidebar / Channel List */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: deviceMode === "tv" ? (sidebarOpen ? 320 : 0) : "100%",
          height: deviceMode === "tv" ? "100%" : (sidebarOpen ? "70%" : 0),
          opacity: sidebarOpen ? 1 : 0,
          position: deviceMode === "mobile" ? "absolute" : "relative",
          bottom: deviceMode === "mobile" ? 0 : "auto",
          left: 0,
          zIndex: 40
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-[#0a0a0a] border-r border-gray-800 flex flex-col z-20 shadow-2xl shadow-black"
      >
        <div className="p-6 space-y-6 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-red-600 uppercase tracking-tighter">TajaTV</h2>
            <div className="flex items-center gap-2">
              {deviceMode === "mobile" && (
                <button onClick={() => setSidebarOpen(false)} className="bg-white/5 p-2 rounded-lg text-white">
                  Cerrar
                </button>
              )}
              <button onClick={onLogout} title="Cerrar Sesión">
                <LogOut className="w-5 h-5 text-gray-500 hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); setFocusedIndex(0); }}
                className={`text-[10px] uppercase font-bold px-3 py-1.5 rounded-full transition-all border ${
                  selectedCategory === cat 
                    ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20" 
                    : "bg-[#222] border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-6">
          <div className="space-y-1">
            {viewingItems.map((channel, idx) => (
              <button
                key={channel.id}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => {
                  setCurrentChannel(channel);
                  setFocusedIndex(idx);
                  if (deviceMode === "mobile") {
                    setSidebarOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-4 px-3 py-3.5 rounded-xl transition-all text-left active:scale-95 touch-manipulation ${
                  currentChannel?.id === channel.id
                    ? "bg-red-600/20 ring-1 ring-red-600/50 shadow-xl border-l-4 border-red-600 pl-2" 
                    : idx === focusedIndex
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-800">
                  {channel.logo ? (
                    <img src={channel.logo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <Tv className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`font-bold truncate text-sm transition-colors ${idx === focusedIndex ? "text-white" : "text-gray-400"}`}>
                    {channel.name}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase font-black opacity-60">
                    {channel.category}
                  </p>
                </div>
                {idx === focusedIndex && (
                  <Play className="w-3 h-3 text-red-600 ml-auto fill-red-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </motion.aside>

      {/* Main Player Area */}
      <main 
        onClick={() => setShowControls(prev => !prev)}
        className="flex-1 bg-black relative group cursor-pointer"
      >
        <video 
          ref={videoRef}
          className="w-full h-full object-contain pointer-events-none"
          playsInline
          autoPlay
          onDoubleClick={(e) => (e.target as HTMLVideoElement).requestFullscreen()}
        />

        {/* Loading / Error States */}
        <AnimatePresence>
          {videoError && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-10"
            >
              <AlertCircle className="w-16 h-16 text-red-600 mb-2" />
              <div className="text-center">
                <h3 className="text-xl font-bold text-white">Error de Transmisión</h3>
                <p className="text-gray-500 text-sm max-w-xs mt-2">No se pudo cargar la señal de <span className="text-red-500 font-bold">{currentChannel?.name}</span>. El servidor podría estar fuera de línea o el formato no es soportado.</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-all"
              >
                Reintentar Conexión
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay Controls (Auto-hide) */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity flex flex-col justify-between p-8 ${showControls || sidebarOpen ? "opacity-100" : "opacity-0"}`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md transition-colors"
                title="Lista de Canales"
              >
                <List className="w-6 h-6" />
              </button>
              
              {/* Device Mode Selector */}
              <div className="bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 flex gap-1">
                 <button 
                   onClick={() => setDeviceMode("tv")}
                   className={`p-2 rounded-full transition-all ${deviceMode === "tv" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"}`}
                   title="Modo TV"
                 >
                    <Tv className="w-5 h-5" />
                 </button>
                 <button 
                   onClick={() => {
                     setDeviceMode("mobile");
                     setSidebarOpen(false);
                   }}
                   className={`p-2 rounded-full transition-all ${deviceMode === "mobile" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"}`}
                   title="Modo Celular"
                 >
                    <Smartphone className="w-5 h-5" />
                 </button>
              </div>

              {currentChannel && (
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                   <p className="text-white font-bold leading-none">{currentChannel.name}</p>
                   <p className="text-[10px] text-gray-400 font-black uppercase mt-1 tracking-wider">{currentChannel.category}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-12">
            <button className="text-white/60 hover:text-white transition-colors">
              <ChevronLeft className="w-10 h-10" />
            </button>
            <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-2xl shadow-red-600/40 cursor-pointer hover:scale-110 transition-transform">
              <Play className="w-8 h-8 fill-white ml-1" />
            </div>
            <button className="text-white/60 hover:text-white transition-colors">
              <ChevronRight className="w-10 h-10" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-6 px-4">
             <div className="flex items-center gap-6">
                <Volume2 className="w-6 h-6 text-white/80" />
                <div className="w-32 h-1 bg-white/20 rounded-full relative overflow-hidden">
                   <div className="absolute top-0 left-0 h-full w-2/3 bg-white"></div>
                </div>
             </div>
             <div className="flex items-center gap-4">
                <button className="text-white/80 hover:text-white transition-colors"><Maximize className="w-6 h-6" /></button>
                <button className="text-white/80 hover:text-white transition-colors"><Settings className="w-6 h-6" /></button>
             </div>
          </div>
        </div>

        {/* Channel Switch Message */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-10 left-10 pointer-events-none"
            >
              <div className="bg-black/60 backdrop-blur-2xl border border-white/5 rounded-2xl p-6 flex items-center gap-6 shadow-3xl">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-xl flex items-center justify-center overflow-hidden border border-white/10">
                   {currentChannel?.logo && <img src={currentChannel.logo} className="w-full h-full object-contain" referrerPolicy="no-referrer" alt="" />}
                </div>
                <div>
                   <h3 className="text-2xl font-black">{currentChannel?.name}</h3>
                   <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                      <span className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-none">Transmitiendo en Vivo</span>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>
    </div>
  );
}
