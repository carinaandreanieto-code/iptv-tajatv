import { useState, useEffect, useRef, useMemo } from "react";
import { collection, getDocs, addDoc, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Customer, Channel, Pack, Metric } from "../types";
import videojs from "video.js";
import "video.js/dist/video-js.css";
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
  const [videoError, setVideoError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

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

  // Handle Video Playback with Video.js + HLS logic
  useEffect(() => {
    if (!currentChannel || !videoContainerRef.current) return;
    
    // Reset states
    setVideoError(null);
    setIsPlaying(false);

    // Initial Cleanup: Ensure previous player is fully disposed
    if (playerRef.current) {
      try {
        playerRef.current.dispose();
      } catch (e) {
        console.error("Cleanup error:", e);
      }
      playerRef.current = null;
    }

    // Explicitly clear container to prevent residual elements or "Element not connected"
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }

    // Create a new video element inside the stable container
    const videoElement = document.createElement("video");
    videoElement.className = "video-js vjs-big-play-centered vjs-tajattv-theme w-full h-full";
    videoContainerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      autoplay: "muted",
      controls: false,
      preload: "auto",
      responsive: true,
      fluid: false, 
      html5: {
        vhs: {
          withCredentials: false,
          overrideNative: !videojs.browser.IS_SAFARI,
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          manifestLoadingRetryDelay: 2000,
          manifestLoadingMaxRetry: 10,
        },
      },
      sources: [{
        src: currentChannel.url,
        type: "application/x-mpegURL"
      }]
    });

    playerRef.current = player;

    player.on("play", () => setIsPlaying(true));
    player.on("pause", () => setIsPlaying(false));
    player.on("volumechange", () => setVolume(player.volume()));

    player.on("ready", () => {
      console.log("IPTV Player Ready:", currentChannel.name);
      player.play().catch(e => {
        console.log("Autoplay blocked or failed:", e);
      });
      
      const vhs = player.tech() && (player.tech() as any).vhs;
      if (vhs) {
        vhs.on("error", (err: any) => {
          console.error("[VHS Error Log]:", err.status, err);
          if (err.status === 0 || err.status === 403) {
            setVideoError(`Error de Acceso (Status: ${err.status}). El servidor IPTV bloqueó la conexión por CORS.`);
          } else if (err.status >= 500) {
            setVideoError("Error del Servidor: El canal está caído en este momento.");
          }
        });
      }
    });

    player.on("error", () => {
      const error = player.error();
      console.error("[VideoJS Player Error]:", error);
      if (error?.code === 4 || error?.code === 2) {
        setVideoError("Error de Red/CORS: El servidor IPTV no permite el acceso desde esta aplicación.");
      } else {
        setVideoError(`Error de Transmisión (Código: ${error?.code}): Verifique su conexión.`);
      }
    });

    // Restore metrics and persistence
    const logMetric = async () => {
      try {
        await addDoc(collection(db, "metrics"), {
          channelId: currentChannel.id,
          userId: customer.customerNumber,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error("Metric error", err);
      }
    };
    logMetric();
    localStorage.setItem(`lastChannel_${customer.customerNumber}`, currentChannel.id);

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
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
        className="flex-1 bg-black relative group cursor-pointer flex items-center justify-center"
      >
        <div 
          ref={videoContainerRef}
          className="w-full h-full"
          data-vjs-player
        />

        {/* Loading / Error States */}
        <AnimatePresence>
          {videoError && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-50 px-6"
            >
              <AlertCircle className="w-16 h-16 text-red-600 mb-2" />
              <div className="text-center px-6">
                <h3 className="text-xl font-bold text-white uppercase tracking-wider">Error de Streaming</h3>
                <p className="text-red-500 text-sm font-medium mt-2 max-w-sm">
                  {videoError}
                </p>
                <p className="text-gray-500 text-xs mt-4">
                  Canal: <span className="text-gray-300">{currentChannel?.name}</span>
                </p>
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
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity flex flex-col justify-between p-8 z-10 ${showControls || sidebarOpen ? "opacity-100" : "opacity-0"}`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setSidebarOpen(!sidebarOpen); }}
                className="bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md transition-colors"
                title="Lista de Canales"
              >
                <List className="w-6 h-6" />
              </button>
              
              {/* Device Mode Selector */}
              <div className="bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 flex gap-1">
                 <button 
                   onClick={(e) => { e.stopPropagation(); setDeviceMode("tv"); }}
                   className={`p-2 rounded-full transition-all ${deviceMode === "tv" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"}`}
                   title="Modo TV"
                 >
                    <Tv className="w-5 h-5" />
                 </button>
                 <button 
                   onClick={(e) => { 
                     e.stopPropagation();
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
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (playerRef.current) {
                  if (isPlaying) playerRef.current.pause();
                  else playerRef.current.play();
                }
              }}
              className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-2xl shadow-red-600/40 cursor-pointer hover:scale-110 transition-transform outline-none"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-white" />
              ) : (
                <Play className="w-8 h-8 fill-white ml-1" />
              )}
            </button>
            <button className="text-white/60 hover:text-white transition-colors">
              <ChevronRight className="w-10 h-10" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-6 px-4">
             <div className="flex items-center gap-6">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (playerRef.current) {
                      playerRef.current.muted(!playerRef.current.muted());
                    }
                  }}
                  className="text-white/80 hover:text-white"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
                <div className="w-32 h-1 bg-white/20 rounded-full relative overflow-hidden group/vol">
                   <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={volume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVolume(val);
                      if (playerRef.current) playerRef.current.volume(val);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                   />
                   <div className="absolute top-0 left-0 h-full bg-white transition-all" style={{ width: `${volume * 100}%` }}></div>
                </div>
             </div>
             <div className="flex items-center gap-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (videoContainerRef.current) {
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
                      } else {
                        videoContainerRef.current.requestFullscreen();
                      }
                    }
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <Maximize className="w-6 h-6" />
                </button>
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
              className="absolute bottom-10 left-10 pointer-events-none z-10"
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

        .video-js {
          width: 100% !important;
          height: 100% !important;
          background-color: transparent !important;
        }
        .vjs-tech {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
        }
      `}</style>
    </div>
  );
}
