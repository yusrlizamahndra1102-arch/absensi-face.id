import React, { useEffect, useMemo, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { Camera, UserCheck, Users, Clock, BookOpen, FileText, Video, RefreshCw, ShieldCheck, Terminal, ScanFace, Wifi, Cpu, Activity, Database, Server, Zap } from "lucide-react";
import { motion } from "framer-motion";

const students = [
  { name: "Yusril iza mahendra", id: "001" },
  { name: "Ella agustina", id: "002" },
];
function formatDate(date) {
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function App() {
  const videoRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const lastScanRef = useRef(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [absensi, setAbsensi] = useState([]);
  const [activeStudent, setActiveStudent] = useState(null);
  const [now, setNow] = useState(new Date());
  const [page, setPage] = useState("absen");
  const [scanStatus, setScanStatus] = useState("idle");
  const [modelsReady, setModelsReady] = useState(false);
  const [matcher, setMatcher] = useState(null);
  const [aiMessage, setAiMessage] = useState("Loading AI models...");
  const [matchScore, setMatchScore] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadAI();
  }, []);

  const today = useMemo(() => formatDate(now), [now]);
  const confidence = matchScore || (activeStudent ? 98 : cameraOn ? 72 : 0);
  const ping = 12 + (now.getSeconds() % 8);

  const playTone = (type = "beep") => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "beep") {
        osc.frequency.value = 880;
        gain.gain.value = 0.03;
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === "granted") {
        osc.frequency.setValueAtTime(720, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(980, ctx.currentTime + 0.18);
        gain.gain.value = 0.04;
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else {
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.22);
        gain.gain.value = 0.045;
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (error) {
      console.log("Audio tidak aktif:", error);
    }
  };

  const loadAI = async () => {
    try {
      setAiMessage("Loading AI models...");

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);

      setAiMessage("Loading face database...");
      const labeledDescriptors = await loadFaceDatabase();

      if (labeledDescriptors.length === 0) {
        setAiMessage("Database wajah kosong. Upload 1.jpg sampai 6.jpg terlebih dahulu.");
        return;
      }

      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
      setMatcher(faceMatcher);
      setModelsReady(true);
      setAiMessage("AI scanner ready");
    } catch (error) {
      console.error(error);
      setAiMessage("AI gagal dimuat. Cek folder public/models dan file 1.jpg - 6.jpg.");
    }
  };

  const loadFaceDatabase = async () => {
  const labeledDescriptors = [];

  const faceMap = {
    "Yusril iza mahendra": [1, 2, 3],
    "Ella agustina": [4, 5, 6],
  };

  for (const student of students) {
    const descriptors = [];
    const imageNumbers = faceMap[student.name] || [];

    for (const num of imageNumbers) {
      try {
        const img = await faceapi.fetchImage(`/${num}.jpg`);
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) descriptors.push(detection.descriptor);
      } catch (error) {
        console.log(`Foto tidak ditemukan: /${num}.jpg`);
      }
    }

    if (descriptors.length > 0) {
      labeledDescriptors.push(
        new faceapi.LabeledFaceDescriptors(student.name, descriptors)
      );
    }
  }

  return labeledDescriptors;
};

  const startCamera = async () => {
    if (!modelsReady) {
      alert("AI belum siap. Tunggu sampai status AI scanner ready.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      setScanStatus("idle");
      setAiMessage("Camera online. Auto scanner active.");
    } catch (error) {
      alert("Kamera tidak bisa dibuka. Pastikan izin kamera sudah diaktifkan.");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setCameraOn(false);
    setActiveStudent(null);
    setScanStatus("idle");
    setAiMessage(modelsReady ? "AI scanner ready" : "Loading AI models...");
  };

  const processFaceRecognition = async () => {
    if (!videoRef.current || !matcher || !cameraOn) return;

    const currentTime = Date.now();
    if (currentTime - lastScanRef.current < 1800) return;
    lastScanRef.current = currentTime;

    try {
      setScanStatus("scanning");
      setAiMessage("Scanning face...");
      playTone("beep");

      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setScanStatus("denied");
        setAiMessage("ACCESS DENIED: wajah tidak terdeteksi");
        setMatchScore(0);
        playTone("denied");
        setTimeout(() => setScanStatus("idle"), 1200);
        return;
      }

      const bestMatch = matcher.findBestMatch(detection.descriptor);
      const distance = bestMatch.distance;
      const score = Math.max(0, Math.min(99, Math.round((1 - distance) * 100)));
      setMatchScore(score);

      if (bestMatch.label === "unknown") {
        setScanStatus("denied");
        setAiMessage(`ACCESS DENIED: unknown face (${score}%)`);
        setActiveStudent(null);
        playTone("denied");
        setTimeout(() => setScanStatus("idle"), 1400);
        return;
      }

      const student = students.find((s) => s.name === bestMatch.label);
      if (!student) return;

      setActiveStudent(student);
      setScanStatus("granted");
      setAiMessage(`ACCESS GRANTED: ${student.name} (${score}%)`);
      playTone("granted");

      setAbsensi((prev) => {
        if (prev.some((a) => a.id === student.id)) return prev;
        return [{ ...student, time: formatTime(new Date()) }, ...prev];
      });

      setTimeout(() => setScanStatus("idle"), 1600);
    } catch (error) {
      console.error(error);
      setScanStatus("denied");
      setAiMessage("Scanner error. Cek console browser.");
      playTone("denied");
      setTimeout(() => setScanStatus("idle"), 1400);
    }
  };

  useEffect(() => {
    if (!cameraOn || !modelsReady || !matcher) return;

    scanIntervalRef.current = setInterval(() => {
      processFaceRecognition();
    }, 2300);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [cameraOn, modelsReady, matcher]);

  const manualScan = () => {
    processFaceRecognition();
  };

  const resetData = () => {
    setAbsensi([]);
    setActiveStudent(null);
    setMatchScore(0);
    setScanStatus("idle");
  };

  return (
    <div className="min-h-screen bg-black text-green-100 selection:bg-green-400 selection:text-black">
      <div className="fixed inset-0 opacity-20 [background-image:linear-gradient(rgba(34,197,94,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,.18)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,.12),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-green-400/30 bg-black/80 px-5 py-4 shadow-[0_0_30px_rgba(34,197,94,.18)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-green-400/60 bg-green-400/10 text-green-300 shadow-[0_0_22px_rgba(34,197,94,.55)]">
            <Terminal size={25} />
          </div>
          <div>
            <h1 className="font-mono text-2xl font-black tracking-widest text-green-300 drop-shadow-[0_0_8px_rgba(74,222,128,.9)]">CYBER ABSEN</h1>
            <p className="font-mono text-xs text-green-500">REAL FACE RECOGNITION SYSTEM</p>
          </div>
        </div>
        <div className="hidden items-center gap-3 font-mono text-xs lg:flex">
          <span className="inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-400/10 px-3 py-2 text-green-300"><Wifi size={14} /> ONLINE</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-400/10 px-3 py-2 text-green-300"><Server size={14} /> PING {ping}ms</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-400/10 px-3 py-2 text-green-300"><ShieldCheck size={14} /> {modelsReady ? "AI READY" : "AI LOADING"}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="hidden rounded-full border border-green-400/40 bg-green-400/10 px-3 py-2 text-green-300 md:block">ROOT/admin_02</span>
          <button className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 font-bold text-red-300 shadow-[0_0_14px_rgba(239,68,68,.25)] hover:bg-red-500/20">LOG OUT</button>
        </div>
      </header>

      <div className="relative z-10 flex">
        <aside className="hidden min-h-[calc(100vh-77px)] w-64 border-r border-green-400/25 bg-black/70 p-4 backdrop-blur md:block">
          <p className="mb-5 font-mono text-sm font-bold text-green-300">// MAIN SERVER</p>
          <nav className="space-y-2 font-mono text-sm">
            {[
              ["dashboard", "Data Operator", Users],
              ["siswa", "Database Siswa", BookOpen],
              ["training", "Training Face", FileText],
              ["log", "Log Absensi", Clock],
              ["absen", "Scan Masuk", Camera],
              ["pulang", "Scan Pulang", UserCheck],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${page === key ? "border-green-400/70 bg-green-400/15 text-green-200 shadow-[0_0_18px_rgba(34,197,94,.25)]" : "border-transparent text-green-600 hover:border-green-400/30 hover:bg-green-400/5 hover:text-green-300"}`}
              >
                <Icon size={17} /> {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="w-full p-4 md:p-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-sm text-green-500">STATUS: {modelsReady ? "AI ONLINE" : "LOADING AI"}</p>
                <h2 className="font-mono text-3xl font-black text-green-300 drop-shadow-[0_0_10px_rgba(74,222,128,.8)]">SCAN ABSEN MASUK</h2>
                <p className="mt-2 font-mono text-sm text-green-600">{today} — kamera membaca wajah asli dari database public/faces.</p>
              </div>
              <div className="rounded-2xl border border-green-400/40 bg-green-400/10 px-5 py-3 font-mono text-lg font-bold text-green-300 shadow-[0_0_18px_rgba(34,197,94,.25)]">
                {now.toLocaleTimeString("id-ID")}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_.95fr]">
              <section className="rounded-3xl border border-green-400/30 bg-black/75 p-5 shadow-[0_0_35px_rgba(34,197,94,.16)] backdrop-blur">
                <div className="mb-4 flex items-center justify-between font-mono">
                  <div className="flex items-center gap-2 font-bold text-green-300"><Video size={19} /> CAMERA FEED</div>
                  <span className="rounded-lg border border-green-400/40 bg-green-400/10 px-3 py-1.5 text-xs font-bold text-green-300">{cameraOn ? "LIVE MODE" : modelsReady ? "AI READY" : "LOADING"}</span>
                </div>

                <div className="relative aspect-video overflow-hidden rounded-2xl border border-green-400/40 bg-black shadow-[inset_0_0_30px_rgba(34,197,94,.12)]">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover opacity-90" />

                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,.08)_50%,rgba(0,0,0,.12)_50%)] bg-[length:100%_4px]" />
                  <div className="pointer-events-none absolute inset-0 border border-green-400/20" />

                  {!cameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-black text-green-300">
                      <motion.div
                        animate={{ scale: [1, 1.45, 1], opacity: [0.3, 0.05, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute h-56 w-56 rounded-full border border-green-400/50 shadow-[0_0_45px_rgba(74,222,128,.35)]"
                      />
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        className="absolute h-72 w-72 rounded-full border-t-2 border-green-300/80"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="relative z-10"
                      >
                        <ScanFace size={66} className="mb-4 drop-shadow-[0_0_14px_rgba(74,222,128,.95)]" />
                      </motion.div>
                      <p className="relative z-10 font-mono text-lg font-black tracking-widest">{modelsReady ? "AI SCANNER READY" : "LOADING AI MODELS"}</p>
                      <p className="relative z-10 mt-2 font-mono text-sm text-green-600">{aiMessage}<span className="animate-pulse">_</span></p>
                      <div className="absolute bottom-5 left-5 right-5 font-mono text-[10px] text-green-700">
                        <p>&gt; model_path: /public/models</p>
                        <p>&gt; face_database: /public/faces</p>
                        <p>&gt; recognition_mode: real_ai</p>
                      </div>
                    </div>
                  )}

                  {cameraOn && (
                    <div className="pointer-events-none absolute inset-0">
                      <div className={`absolute left-1/2 top-5 -translate-x-1/2 rounded-full border px-4 py-2 font-mono text-xs font-black shadow-[0_0_18px_rgba(74,222,128,.45)] ${scanStatus === "denied" ? "border-red-400/70 bg-red-950/80 text-red-300" : "border-green-400/50 bg-black/80 text-green-300"}`}>
                        {scanStatus === "scanning" ? "SCANNING FACE..." : scanStatus === "granted" ? "ACCESS GRANTED" : scanStatus === "denied" ? "ACCESS DENIED" : "AUTO AI SCANNER ACTIVE"}
                      </div>
                      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-green-400/40 bg-black/80 px-4 py-2 font-mono text-xs text-green-300">
                        {aiMessage}
                      </div>
                      <div className="absolute left-5 top-5 h-10 w-10 border-l-4 border-t-4 border-green-400 shadow-[0_0_14px_rgba(74,222,128,.7)]" />
                      <div className="absolute right-5 top-5 h-10 w-10 border-r-4 border-t-4 border-green-400 shadow-[0_0_14px_rgba(74,222,128,.7)]" />
                      <div className="absolute bottom-5 left-5 h-10 w-10 border-b-4 border-l-4 border-green-400 shadow-[0_0_14px_rgba(74,222,128,.7)]" />
                      <div className="absolute bottom-5 right-5 h-10 w-10 border-b-4 border-r-4 border-green-400 shadow-[0_0_14px_rgba(74,222,128,.7)]" />
                      <motion.div
                        animate={{ y: [0, 250, 0] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 right-0 top-0 h-1 bg-green-300 shadow-[0_0_18px_rgba(74,222,128,1)]"
                      />
                    </div>
                  )}

                  {cameraOn && activeStudent && (
                    <div className="absolute left-1/2 top-1/2 h-44 w-36 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-green-300 shadow-[0_0_25px_rgba(74,222,128,.95),0_0_0_999px_rgba(0,0,0,.12)]">
                      <span className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-green-400 bg-black px-3 py-1 font-mono text-xs font-bold text-green-300 shadow-[0_0_14px_rgba(74,222,128,.6)]">ACCESS: {activeStudent.name}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-3 font-mono">
                  {!cameraOn ? (
                    <button onClick={startCamera} disabled={!modelsReady} className="rounded-xl border border-green-400 bg-green-400 px-5 py-3 font-black text-black shadow-[0_0_22px_rgba(74,222,128,.55)] hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40">OPEN CAMERA</button>
                  ) : (
                    <button onClick={stopCamera} className="rounded-xl border border-green-400/60 bg-black px-5 py-3 font-black text-green-300 shadow-[0_0_16px_rgba(34,197,94,.25)] hover:bg-green-400/10">CLOSE CAMERA</button>
                  )}
                  <button onClick={manualScan} disabled={!cameraOn || scanStatus === "scanning"} className="rounded-xl border border-lime-300 bg-lime-300 px-5 py-3 font-black text-black shadow-[0_0_22px_rgba(190,242,100,.45)] hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40">MANUAL SCAN</button>
                  <button onClick={resetData} className="inline-flex items-center gap-2 rounded-xl border border-green-400/50 px-5 py-3 font-black text-green-300 hover:bg-green-400/10"><RefreshCw size={17} /> RESET</button>
                </div>
              </section>

              <section className="rounded-3xl border border-green-400/30 bg-black/75 p-5 shadow-[0_0_35px_rgba(34,197,94,.16)] backdrop-blur">
                <div className="mb-4 flex items-center justify-between font-mono">
                  <h3 className="font-black text-green-300">ACCESS LOG</h3>
                  <span className="rounded-full border border-green-400/40 bg-green-400/10 px-3 py-1 text-xs font-bold text-green-300">{absensi.length} VERIFIED</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-green-400/40">
                  <table className="w-full text-left font-mono text-sm">
                    <thead className="bg-green-400/10 text-green-300">
                      <tr>
                        <th className="px-4 py-3">NAMA</th>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">TIME</th>
                      </tr>
                    </thead>
                    <tbody>
                      {absensi.length === 0 ? (
                        <tr><td colSpan="3" className="px-4 py-14 text-center text-green-700">NO ACCESS DATA FOUND</td></tr>
                      ) : absensi.map((item) => (
                        <tr key={item.id} className="border-t border-green-400/20 text-green-200">
                          <td className="px-4 py-3 font-bold">{item.name}</td>
                          <td className="px-4 py-3 text-green-500">{item.id}</td>
                          <td className="px-4 py-3 text-green-500">{item.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 font-mono text-xs">
                  <div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-green-300"><Cpu size={16} /> CPU LOAD</div>
                    <p className="text-2xl font-black text-green-300">{34 + (now.getSeconds() % 21)}%</p>
                  </div>
                  <div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-green-300"><Activity size={16} /> FACE MATCH</div>
                    <p className="text-2xl font-black text-green-300">{confidence}%</p>
                  </div>
                  <div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-green-300"><Database size={16} /> DATABASE</div>
                    <p className="font-black text-green-300">REAL FACES</p>
                  </div>
                  <div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-green-300"><Zap size={16} /> SCANNER</div>
                    <p className="font-black text-green-300">{cameraOn ? "ACTIVE" : modelsReady ? "READY" : "LOADING"}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-green-400/25 bg-green-400/5 p-4 font-mono text-xs text-green-600">
                  <div className="mb-2 flex items-center gap-2 text-green-300"><ShieldCheck size={16} /> SYSTEM LOG</div>
                  <p>&gt; scanner_module: {cameraOn ? "active" : "standby"}</p>
                  <p>&gt; model_status: {modelsReady ? "loaded" : "loading"}</p>
                  <p>&gt; face_database: /1.jpg - /6.jpg</p>
                  <p>&gt; face_confidence: {confidence}%</p>
                  <p>&gt; last_message: {aiMessage}</p>
                  <p>&gt; last_sync: {formatTime(now)}</p>
                </div>
              </section>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
