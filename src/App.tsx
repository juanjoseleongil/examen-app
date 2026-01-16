import React, { useState, useEffect, useCallback } from 'react';
import { Clock, User, Monitor, Play, Shield } from 'lucide-react';
import { db, auth } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  questionsMAT,
  questionsHLC,
  questionsHLE,
  questionsCNA,
  questionsCSO,
  questionsART,
  questionsETI,
  questionsEDF,
  questionsTEC,
  questionsSEG,
  questionsCTE,
  questionsAUC,
  redaccionBanco,
} from './questions';

// === TIPOS PERSONALIZADOS ===
/*
interface Candidate {
  name: string;
  idNumber: string;
  status: 'active' | 'completed' | 'expired';
  startTime?: string;
  currentQuestion?: number;
  lastActivity: string;
  timeLeft?: number;
  [key: string]: any;
}
*/

interface QuestionDetail {
  question: number;
  userAnswer: number | undefined;
  correctAnswer: number;
  isCorrect: boolean;
  questionText: string;
  userAnswerText?: string;
  correctAnswerText?: string;
}

interface ExamResult {
  id: string;
  name: string;
  idNumber: string;
  date: string;
  timeUsed: string;
  ip: string;
  userAgent: string;
  correct: number;
  total: number;
  pct: string;
  passed: boolean;
  details: QuestionDetail[];
  violations: number;
  asignatura: string;
  redaccion: string;
  redaccionId?: number | null;
}

interface ActiveSession {
  id: string;
  name: string;
  idNumber: string;
  currentQuestion: number;
  timeLeft: number;
  lastActivity: Timestamp;
  startTime: Timestamp;
}

const MAX_VIOLATIONS = 5;

const formatTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function MathExam() {
  // TODOS LOS STATES AL INICIO
  const [mode, setMode] = useState<'select' | 'exam' | 'admin' | 'admin-login'>('select');
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(3600);
  const [candidateName, setCandidateName] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [results, setResults] = useState<ExamResult[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [startingExam, setStartingExam] = useState(false);
  const [proctorViolations, setProctorViolations] = useState(0);
  const [proctorLocked, setProctorLocked] = useState(false);
  const [proctorWarningShown, setProctorWarningShown] = useState(false);
  const [justHandledViolation, setJustHandledViolation] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const [alertDiv, setAlertDiv] = useState('');
  const [selectedAsignatura, setSelectedAsignatura] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState(questionsMAT);
  const [redaccionText, setRedaccionText] = useState('');
  const [redaccionSelected, setRedaccionSelected] = useState<number | null>(null);
  const [showWriting, setShowWriting] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  
  const isFinishing = React.useRef(false);

  // FUNCIONES LÓGICAS
  const calculateScore = useCallback((ans: Record<number, number>) => {
  let correct = 0;
  const details: QuestionDetail[] = [];
  currentQuestions.forEach((q, i) => {
    const userAnswer = ans[i];
    const isCorrect = userAnswer === q.correct;
    if (isCorrect) correct++;
    
    details.push({
      question: q.id,
      userAnswer: userAnswer ?? null,
      correctAnswer: q.correct,
      isCorrect,
      questionText: q.question,
      // Guardamos el texto literal de las opciones
      userAnswerText: userAnswer !== undefined ? q.options[userAnswer] : 'Sin respuesta',
      correctAnswerText: q.options[q.correct],
    });
  });
    
    const pct = (correct / currentQuestions.length) * 100;
    return {
      correct,
      total: currentQuestions.length,
      pct: pct.toFixed(1),
      passed: pct >= 70,
      details,
    };
  }, [currentQuestions]);

  const finishExam = useCallback(async (finalAnswers?: Record<number, number>) => {
  if (isFinishing.current || finished) return;
  isFinishing.current = true;

  const currentAnswers = finalAnswers || answers;
  const score = calculateScore(currentAnswers);
  
  // No esperes demasiado por la IP, si falla, sigue adelante
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 segundos máximo
    clearTimeout(timeoutId);
  } catch (e) {
    console.log("No se pudo obtener la IP, continuando...");
  }
  const newResult: Omit<ExamResult, 'id'> = {
    name: candidateName,
    idNumber: candidateId,
    date: new Date().toISOString(),
    timeUsed: formatTime(3600 - timeLeft),
    ip: "ip test",
    userAgent: navigator.userAgent,
    correct: score.correct,
    total: score.total,
    pct: score.pct,
    passed: score.passed,
    details: score.details,
    violations: proctorViolations,
    asignatura: selectedAsignatura,
    redaccion: redaccionText.trim(),
    redaccionId: redaccionSelected,
  };

  try {
    await addDoc(collection(db, "results"), newResult);
    
    // Si hay reincidencia, marcamos como baneado
    if (proctorViolations >= MAX_VIOLATIONS) {
      await addDoc(collection(db, "bannedCandidates"), {
        idNumber: candidateId.trim().toLowerCase(),
        bannedAt: new Date().toISOString(),
        violations: proctorViolations,
        reason: "Exceso en cambios de pestaña/ventana/minimización"
      });
    }

    if (sessionId) {
      await deleteDoc(doc(db, "activeSessions", sessionId));
    }
  } catch (error) {
    console.error("Error finalizando:", error);
    setAlertDiv("Error de conexión al guardar. Por favor, intente de nuevo.");
    isFinishing.current = false;
    return;
  }

  setFinished(true);
  setProctoringActive(false);
}, [calculateScore, answers, candidateName, candidateId, timeLeft, proctorViolations, selectedAsignatura, redaccionSelected, redaccionText, sessionId, finished]);

  // TODOS LOS EFFECTS AL INICIO
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdminLoggedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (started && !finished && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && started && !finished) {
      finishExam();
    }
  }, [started, finished, timeLeft, finishExam]);

  useEffect(() => {
    if (mode !== 'admin' || !isAdminLoggedIn) return;
    
    setLoadingResults(true);
    const q = query(collection(db, "results"), orderBy("date", "desc"));
    
    getDocs(q)
      .then((querySnapshot) => {
        const loadedResults = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ExamResult[];
        setResults(loadedResults);
      })
      .catch((error) => console.error("Error loading results:", error))
      .finally(() => setLoadingResults(false));
  }, [mode, isAdminLoggedIn]);

useEffect(() => {
    if (mode !== 'admin' || !isAdminLoggedIn) return;
    
    // Traemos la colección completa para poder procesar las sesiones "viejas"
    // Nota: Si el sistema te pide un índice para orderBy, puedes quitarlo temporalmente
    const q = query(collection(db, "activeSessions"), orderBy("startTime", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];
      
      // FILTRADO EN EL CLIENTE: 
      // 1. Incluye las sesiones que no tienen el campo 'status' (los 11 usuarios actuales).
      // 2. Incluye las sesiones marcadas como 'activa'.
      // 3. Excluye únicamente las marcadas como 'completada'.
      const activeSessionsOnly = allDocs.filter(session => 
        session.status !== 'completada'
      );
      
      setActiveSessions(activeSessionsOnly);
    }, (error) => {
      console.error("Error en la escucha de sesiones activas:", error);
    });
    
    return () => unsubscribe();
  }, [mode, isAdminLoggedIn]);

  // Reemplaza el useEffect que sincroniza la sesión por este:
useEffect(() => {
  if (sessionId && started && !finished) {
    // Solo actualizamos Firebase si la pregunta cambió 
    // o si el tiempo es múltiplo de 30 (cada 30 segundos)
    if (timeLeft % 30 === 0 || timeLeft === 3599) { 
      const sessionRef = doc(db, "activeSessions", sessionId);
      updateDoc(sessionRef, {
        currentQuestion: currentQ + 1,
        timeLeft: timeLeft,
        lastActivity: new Date().toISOString()
      }).catch(err => console.error("Error de sincronización:", err));
    }
  }
  // Quitamos timeLeft de las dependencias para que no se ejecute cada segundo
  // Lo manejaremos con una lógica interna o solo por cambios de pregunta
}, [currentQ, sessionId, started, finished, timeLeft]);

  useEffect(() => {
    if (!started || finished || proctorLocked) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleViolation();
      }
    };
    
    const handleBlur = () => {
      handleViolation();
    };
    
    const handleViolation = () => {
      if (proctorWarningShown || justHandledViolation) return;
      
      setJustHandledViolation(true);
      setProctorWarningShown(true);
      
      setProctorViolations((prev) => {
        const newCount = prev + 1;
        if (newCount >= MAX_VIOLATIONS) {
          setViolationMessage("Debido a reincidencia en movimientos no permitidos (minimizar ventana, cambiar pestaña o ventana), su examen se termina automáticamente.");
          setTimeout(() => {
            setProctorLocked(true);
            finishExam();
          }, 5000);
          return newCount;
        } else {
          setViolationMessage(`Se ha detectado un movimiento no permitido (minimizar ventana, cambiar pestaña o ventana). Por favor evite: minimizar, cambiar pestañas o ventanas. Intentos restantes: ${MAX_VIOLATIONS - newCount}`);
          return newCount;
        }
      });
      
      setTimeout(() => {
        setProctorWarningShown(false);
        setJustHandledViolation(false);
      }, 3000);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [started, finished, proctorLocked, proctorWarningShown, justHandledViolation, finishExam]);

const asignaturasSinRedaccion = [
  "Servicios generales",
  "Conductor de transporte escolar",
  "Auxiliar contable"
];

  const handleNext = async () => {
    setViolationMessage('');
    
    // FASE 1: Preguntas de opción múltiple
    if (!showWriting) {
      if (selected === null) return;
      
      setSavingAnswer(true);
    const updatedAnswers = { ...answers, [currentQ]: selected };
    setAnswers(updatedAnswers);
    
      await new Promise(resolve => setTimeout(resolve, 0));
      setSavingAnswer(false);
      
if (currentQ < currentQuestions.length - 1) {
      setCurrentQ((prev) => prev + 1);
      setSelected(null);
    } else {
      // Verificamos si terminamos aquí o vamos a redacción
      if (asignaturasSinRedaccion.includes(selectedAsignatura)) {
        finishExam(updatedAnswers); // Pasamos las respuestas frescas
      } else {
        setShowWriting(true);
      }
    }
    return;
  }
    
    // FASE 2: Validación de la redacción
    if (!redaccionSelected) {
      setAlertDiv("Debe seleccionar una consigna de redacción antes de finalizar.");
      return;
    }
    
    setSavingAnswer(true); // Desactiva el botón inmediatamente
    await finishExam();    // Esperamos a que la función termine
    
    //if (redaccionText.trim().length < 200) {
      //setAlertDiv("La redacción debe tener al menos 200 caracteres. Por favor complete su respuesta.");
      //return;
    //}
    
    finishExam();
  };

  // ====== RENDER ======
  if (mode === 'select') {
    return (
      <div 
        className="min-h-screen bg-main p-6"
        id="examen-container"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button === 0) e.preventDefault();
        }}
      >
        <div className="max-w-4xl w-full bg-card rounded-3xl shadow-2xl p-16 text-center border-8 border-indigo-200">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight">
            Prueba de conocimientos específicos
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <button 
              onClick={() => setMode('exam')}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-8 px-6 md:px-16 rounded-3xl shadow-2xl text-2xl md:text-3xl transition-all hover:shadow-3xl hover:scale-105 flex flex-col items-center justify-center min-h-[180px] whitespace-normal break-words text-center"
            >
              <Play className="w-12 h-12 mb-4" />
              PROFE
            </button>
            
            <button 
              onClick={() => setMode('admin-login')}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-8 px-6 md:px-16 rounded-3xl shadow-2xl text-2xl md:text-3xl transition-all hover:shadow-3xl hover:scale-105 flex flex-col items-center justify-center min-h-[180px] whitespace-normal break-words text-center"
            >
              <Shield className="w-12 h-12 mb-4" />
              ADMINISTRADOR
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'admin-login') {
    return (
      <div 
        data-screen="candidate-info"
        className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center"
      >
        <div className="bg-card rounded-3xl shadow-2xl p-12 border-8 border-purple-200 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl md:text-6xl font-black text-gray-900 dark:text-black break-words">
            Panel Administrador
          </h1>
          
          <input 
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="Email administrador"
            pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
            title="Ingresa un correo válido (ej. ejemplo@dominio.com)"
            className="w-full p-4 mb-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none"
          />
          
          <input 
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full p-4 mb-8 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none"
          />
          
          <button 
            onClick={async () => {
              try {
                await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
                setIsAdminLoggedIn(true);
                setMode('admin');
              } catch (error: any) {
                alert("Error de login: " + error.message);
              }
            }}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-4 rounded-xl shadow-2xl text-xl transition-all hover:shadow-3xl hover:scale-105"
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'admin') {
  
  const forceCloseSession = async (id: string) => {
  try {
    const sessionRef = doc(db, "activeSessions", id);
    await updateDoc(sessionRef, { 
      status: 'completada',
      lastActivity: new Date().toISOString()
    });
    // Opcional: Podrías disparar una alerta de éxito aquí
  } catch (err) {
    console.error("Error al cerrar sesión:", err);
  }
};
  
    const asignaturasSinGrados = [
    "Servicios generales",
    "Conductor de transporte escolar",
    "Auxiliar contable"
    ];
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight">
              Panel Administrador
            </h1>
            
            <button 
              onClick={async () => {
                await signOut(auth);
                setIsAdminLoggedIn(false);
                setMode('select');
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg"
            >
              Cerrar Sesión
            </button>
          </div>

          {/* PROFESORES EN VIVO */}
          <div className="mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4">
              <Monitor className="w-10 h-10 mr-4 text-emerald-600" />
              Profesores en vivo ({activeSessions.length})
            </h2>
            
            {activeSessions.length === 0 ? (
              <p className="text-xl text-gray-600">No hay profesores activos en este momento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSessions.map(session => (
                  <div key={session.id} className="bg-card rounded-2xl shadow-xl p-6 border-l-4 border-emerald-500">
                  <button
        onClick={() => forceCloseSession(session.id)}
        className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-full text-xs"
      >
        Finalizar Forzoso
      </button>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-2xl md:text-3xl font-semibold text-accent mb-4">
                        {session.name}
                      </h3>
                      <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                        ACTIVO
                      </span>
                    </div>
                    
                    <p className="text-gray-600 mb-2">Cédula: {session.idNumber}</p>
                    <p className="text-lg font-semibold mb-2">
                      Pregunta: <span className="text-indigo-600">{session.currentQuestion}/{currentQuestions.length}</span>
                    </p>
                    <p className="text-lg font-semibold mb-2">
                      Tiempo restante: <span className="text-red-600">{formatTime(session.timeLeft)}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Última actividad: {session.lastActivity?.toDate?.().toLocaleTimeString() || 'Ahora'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RESULTADOS FINALIZADOS */}
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4">
            Resultados finalizados
          </h2>
          
          {loadingResults ? (
            <p className="text-center text-2xl">Cargando resultados...</p>
          ) : results.length === 0 ? (
            <p className="text-center text-2xl text-gray-600">No hay resultados aún.</p>
          ) : (
            <div className="bg-card shadow-2xl">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  <tr>
                    <th className="p-6 text-left">Nombre</th>
                    <th className="p-6 text-left">Cédula</th>
                    <th className="p-6 text-left">Asignatura</th>
                    <th className="p-6 text-left">Fecha</th>
                    <th className="p-6 text-center">Correctas</th>
                    <th className="p-6 text-center">Porcentaje</th>
                    <th className="p-6 text-center">Estado</th>
                    <th className="p-6 text-center">Tiempo</th>
                    <th className="p-6 text-center">Infracciones</th>
                    <th className="p-6 text-center">Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <>
                      <tr key={r.id} className="border-b hover:bg-card-50">
                        <td className="p-6">{r.name}</td>
                        <td className="p-6">{r.idNumber}</td>
                        <td className="p-6">{r.asignatura}</td>
                        <td className="p-6">{new Date(r.date).toLocaleString('es-CO')}</td>
                        <td className="p-6 text-center">{r.correct}/{r.total}</td>
                        <td className="p-6 text-center font-bold" style={{ color: r.passed ? '#059669' : '#dc2626' }}>
                          {r.pct}%
                        </td>
                        <td className="p-6 text-center font-bold">
                          {r.passed ? 'APROBADO' : 'NO APROBADO'}
                        </td>
                        <td className="p-6 text-center">{r.timeUsed}</td>
                        <td className="p-6 text-center font-bold" style={{ color: r.violations > 0 ? '#dc2626' : '#059669' }}>
                          {r.violations || 0}
                        </td>
                        <td className="p-6 text-center">
                          <button 
                            onClick={() => setExpandedResultId(expandedResultId === r.id ? null : r.id)}
                            className="bg-indigo-600 text-white py-1 px-3 rounded-lg hover:bg-indigo-700 detailsBtn"
                          >
                            {expandedResultId === r.id ? 'Ocultar' : 'Ver Detalles'}
                          </button>
                        </td>
                      </tr>
                      
                      {expandedResultId === r.id && (
                        <tr>
                          <td colSpan={10} className="p-8 bg-slate-200/50 shadow-inner">
                            <div className="max-h-96 overflow-y-auto shadow-xl">
                              <h3 className="text-2xl font-bold mb-6">Detalles del examen</h3>
                              
{asignaturasSinGrados.includes(r.asignatura) ? (
    /* === VISTA CONTINUA PARA ASIGNATURAS ESPECIALES === */
    <div className="mb-10 pb-6 border-b border-gray-200 last:border-b-0">
      <table className="w-full table-fixed border-collapse mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-3 text-left" style={{ width: '49%' }}>Pregunta</th>
            <th className="p-3 text-center" style={{ width: '24%' }}>Respuesta</th>
            <th className="p-3 text-center" style={{ width: '24%' }}>Correcta</th>
          </tr>
        </thead>
        <tbody>
          {r.details.map((detail: any, index: number) => (
            <tr key={index} className="border-b last:border-b-0">
              <td className="p-3 text-left break-words whitespace-normal align-top">
                {detail.questionText}
              </td>
              <td 
                className="p-3 text-left font-bold align-top break-words" 
                style={{ color: detail.isCorrect ? '#15803d' : '#b91c1c' }}
              >
                {detail.userAnswerText}
              </td>
              <td className="p-3 text-left align-top break-words text-gray-700">
                {detail.correctAnswerText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    /* === VISTA POR GRADOS (1° a 9°) PARA ASIGNATURAS ESTÁNDAR === */
Array.from({ length: 9 }, (_, groupIndex) => {
      const groupStart = groupIndex * 5;
      const groupDetails = r.details.slice(groupStart, groupStart + 5);
      const groupCorrect = groupDetails.filter((d: any) => d.isCorrect).length;
      const groupTotal = 5;
      const groupPct = (groupCorrect / groupTotal) * 100;

      return (
        <div key={groupIndex} className="mb-10 pb-6 border-b border-gray-200 last:border-b-0">
          <div className="flex items-center mb-4">
            <h4 className="text-xl font-semibold text-indigo-900">Grado {groupIndex + 1}° </h4>
            <span className="font-bold text-yellow-700">&emsp; Acierto: {groupPct.toFixed(1)}%</span>
          </div>
          
          <table className="w-full table-fixed border-collapse mb-8">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-3 text-left" style={{ width: '49%' }}>Pregunta</th>
                <th className="p-3 text-center" style={{ width: '24%' }}>Respuesta</th>
                <th className="p-3 text-center" style={{ width: '24%' }}>Correcta</th>
              </tr>
            </thead>
            <tbody>
              {groupDetails.map((detail: any, index: number) => (
                <tr key={index} className="border-b last:border-b-0">
                  <td className="p-3 text-left break-words whitespace-normal align-top">
                    {detail.questionText}
                  </td>
                  <td 
                    className="p-3 text-left font-bold align-top break-words" 
                    style={{ color: detail.isCorrect ? '#15803d' : '#b91c1c' }}
                  >
                    {detail.userAnswerText}
                  </td>
                  <td className="p-3 text-left align-top break-words text-gray-700">
                    {detail.correctAnswerText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    })
  )}
                              
                              {/* Diagrama acumulado final */}
                              <div className="mt-8 pt-6 border-t border-gray-200">
                                <h4 className="text-xl font-semibold mb-4 text-center">Resultado Acumulado</h4>
                                <div className="flex items-center justify-center">
                                  <svg viewBox="0 0 36 36" className="w-40 h-40">
                                    <path 
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      fill="none"
                                      stroke="#e5e7eb"
                                      strokeWidth="4"
                                    />
                                    <path 
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      fill="none"
                                      stroke="#10b981"
                                      strokeWidth="4"
                                      strokeDasharray={`${parseFloat(r.pct)}, 100`}
                                    />
                                    <text x="18" y="21" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#111827">
                                      {r.pct}%
                                    </text>
                                  </svg>
                                </div>
                              </div>
                              
{/* Solo mostrar si la asignatura requiere redacción */}
{!["Servicios generales", "Conductor de transporte escolar", "Auxiliar contable"].includes(r.asignatura) && (
  <div className="mt-8 pt-6 border-t border-gray-200">
    <h4 className="text-xl font-semibold mb-4 text-indigo-900">Redacción Final</h4>
    {(() => {
      const consignaOriginal = redaccionBanco.find(b => b.id === r.redaccionId);
      return (
        <div className="flex flex-col gap-4">
          {consignaOriginal && (
            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 shadow-sm">
              <p className="font-bold text-indigo-900 mb-1">
                Consigna elegida: {consignaOriginal.titulo}
              </p>
              <p className="text-sm text-indigo-800 italic whitespace-pre-line">
                {consignaOriginal.consigna}
              </p>
            </div>
          )}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 whitespace-pre-line text-gray-800 shadow-sm">
            {r.redaccion || 'No se redactó respuesta.'}
          </div>
        </div>
      );
    })()}
  </div>
)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== EXAMEN (PROFESOR) ======
  if (!started) {
    return (
      <div 
        data-screen="candidate-info"
        className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center"
        id="exc2"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="max-w-2xl w-full bg-card rounded-3xl shadow-2xl p-12 text-center border-8 border-indigo-200">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight">
            Datos del Profesor
          </h1>
          
          <input 
            type="text"
            value={candidateName}
            onChange={(e) => {
              const value = e.target.value.normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-ZñÑ\s]/g, "");
              setCandidateName(value);
            }}
            placeholder="Nombre completo"
            className="form-input"
          />
          
          <input 
            type="number"
            value={candidateId}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              if (value.length <= 10) {
                setCandidateId(value);
              }
            }}
            onBlur={() => {
              const num = parseInt(candidateId, 10);
              if (candidateId && (num < 1000000 || num > 9999999999)) {
                alert("El número de documento debe tener entre 7 y 10 dígitos.");
                setCandidateId("");
              }
            }}
            placeholder="Número de cédula"
            className="form-input"
          />
          
          <select 
            value={selectedAsignatura}
            onChange={(e) => setSelectedAsignatura(e.target.value)}
            className="form-input"
          >
            <option value="">Seleccione la asignatura</option>
            <option value="Ciencias Naturales">Ciencias Naturales</option>
            <option value="Ciencias Sociales">Ciencias Sociales</option>
            <option value="Artística">Artística</option>
            <option value="Ética y Religión">Ética y Religión</option>
            <option value="Educación Física">Educación Física</option>
            <option value="Lengua Castellana">Lengua Castellana</option>
            <option value="Lengua Extranjera">Lengua Extranjera</option>
            <option value="Matemática">Matemática</option>
            <option value="Tecnología">Tecnología</option>
            <option value="Servicios generales">Servicios generales</option>
            <option value="Conductor de transporte escolar">Conductor de transporte escolar</option>
            <option value="Auxiliar contable">Auxiliar contable</option>
          </select>
          
          <button 
            onClick={async () => {
              const bannedQuery = query(
                collection(db, "bannedCandidates"), 
                where("idNumber", "==", candidateId.trim().toLowerCase())
              );
              const bannedSnapshot = await getDocs(bannedQuery);
              
              if (!bannedSnapshot.empty) {
                alert("Tu cuenta ha sido bloqueada por violaciones de proctoring. No puedes volver a presentar el examen.");
                setStartingExam(false);
                return;
              }
              
              if (!selectedAsignatura) {
                alert("Por favor seleccione una asignatura.");
                setStartingExam(false);
                return;
              }
              
              // Cargar preguntas según asignatura
              let loadedQuestions;
              switch (selectedAsignatura) {
                case "Ciencias Naturales":
                  loadedQuestions = questionsCNA;
                  break;
                case "Ciencias Sociales":
                  loadedQuestions = questionsCSO;
                  break;
                case "Artística":
                  loadedQuestions = questionsART;
                  break;
                case "Ética y Religión":
                  loadedQuestions = questionsETI;
                  break;
                case "Educación Física":
                  loadedQuestions = questionsEDF;
                  break;
                case "Lengua Castellana":
                  loadedQuestions = questionsHLC;
                  break;
                case "Lengua Extranjera":
                  loadedQuestions = questionsHLE;
                  break;
                case "Matemática":
                  loadedQuestions = questionsMAT;
                  break;
                case "Tecnología":
                  loadedQuestions = questionsTEC;
                  break;
                case "Servicios generales":
                  loadedQuestions = questionsSEG;
                  break;
                case "Conductor de transporte escolar":
                  loadedQuestions = questionsCTE;
                  break;
                case "Auxiliar contable":
                  loadedQuestions = questionsAUC;
                  break;
                default:
                  loadedQuestions = questionsMAT;
              }
              
              setCurrentQuestions(loadedQuestions);
              
              if (!candidateName || !candidateId || startingExam) return;
              
              setStartingExam(true);
              
              try {
                const sessionRef = await addDoc(collection(db, "activeSessions"), {
                  name: candidateName,
                  idNumber: candidateId,
                  currentQuestion: 1,
                  timeLeft: 3600,
                  lastActivity: serverTimestamp(),
                  startTime: serverTimestamp(),
                });
                setSessionId(sessionRef.id);
              } catch (error) {
                console.error("Error creando sesión:", error);
                alert("Error al iniciar proctoring. Intenta de nuevo.");
                setStartingExam(false);
                return;
              }
              
              setStarted(true);
              setProctoringActive(true);
            }}
            disabled={!candidateName || !candidateId || !selectedAsignatura || startingExam}
            className={`w-full py-6 rounded-2xl font-black text-2xl shadow-2xl transition-all transform ${
              !candidateName || !candidateId || startingExam
                ? 'bg-gray-400 text-gray-500 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer'
            } ${startingExam ? 'scale-95 opacity-75 cursor-wait' : ''}`}
          >
            {startingExam ? (
              'Iniciando...'
            ) : (
              <>
                <Play className="w-10 h-10 mr-4 inline" />
                INICIAR EXAMEN
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (started && !finished) {
    const q = currentQuestions[currentQ];
    const prog = ((currentQ + 1) / currentQuestions.length) * 100;
    
    return (
      <div 
        className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-6"
        id="exc3"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-card backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-celeste/30">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-red-100 p-3 rounded-xl border-2 border-red-200 shadow-md">
                  <Clock className="w-6 h-6 text-red-600 mr-2" />
                  <span className="text-2xl font-mono font-bold text-red-700 tracking-wide">
                    {formatTime(timeLeft)}
                  </span>
                </div>
                
                <div className="bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-xl font-mono font-semibold text-indigo-900 shadow-inner">
                  Pregunta {currentQ + 1} de {currentQuestions.length}
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm font-semibold text-gray-800 bg-card/60 px-4 py-2 rounded-xl shadow-sm">
                <User size={18} />
                {candidateName}
                <span className="ml-2 text-indigo-700 font-mono">#{candidateId}</span>
                
                {proctoringActive && (
                  <div className="flex items-center gap-1 bg-emerald-200 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                    <Monitor size={14} />
                    Proctoring ON
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-full bg-card-200 rounded-full h-3 shadow-inner">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full shadow-lg transition-all duration-1000"
                style={{ width: `${prog}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-card/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-celeste/30">
          
            {!showWriting ? (
  /* FASE 1: Muestra solo la pregunta de opción múltiple */
  <>
    <h2 className="text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4">
      Pregunta {currentQ + 1}
    </h2>
    
    <div className="w-16 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full mb-8" />
    
    <p className="text-xl leading-relaxed text-gray-800 mb-10">
      {q.question}
    </p>
    
    <div className="space-y-4 mb-12">
      {q.options.map((opt, i) => (
        <button 
          key={i}
          onClick={() => setSelected(i)}
          className={`group relative w-full p-6 rounded-2xl border-3 font-medium text-left transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl ${
            selected === i
              ? 'border-indigo-500 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-indigo-200/50 scale-[1.02]'
              : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 shadow-md'
          }`}
        >
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-2xl border-4 mr-5 flex items-center justify-center font-bold text-sm shadow-md transition-all group-hover:scale-110 ${
              selected === i
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-300/50'
                : 'bg-card border-gray-300 text-gray-600 shadow-sm'
            }`}>
              {String.fromCharCode(65 + i)}
            </div>
            <span className="text-lg leading-relaxed">{opt}</span>
          </div>
        </button>
      ))}
    </div>
  </>
) : (
  /* FASE 2: Muestra solo la redacción final */
  <div className="mt-8">
    <h3 className="text-2xl font-bold mb-4">Pregunta de Redacción Final</h3>
    {!redaccionSelected ? (
      <div className="mb-6">
        <p className="text-lg mb-4">Seleccione un caso para desarrollar:</p>
        <select 
          value=""
          onChange={(e) => setRedaccionSelected(parseInt(e.target.value))}
          className="w-full p-4 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg bg-white"
        >
          <option value="">--Seleccione un caso--</option>
          {redaccionBanco.map(q => (
            <option key={q.id} value={q.id}>{q.titulo}</option>
          ))}
        </select>
      </div>
    ) : (
      <div className="mb-6">
        <p className="text-xl font-semibold mb-4"> <strong>Caso: </strong>
          {redaccionBanco.find(q => q.id === redaccionSelected)?.titulo}
        </p>
        <p className="text-lg mb-4 whitespace-pre-line text-gray-600"> <strong>Descripción: </strong> 
          {redaccionBanco.find(q => q.id === redaccionSelected)?.descripcion}
        </p>
        <p className="text-lg mb-4 whitespace-pre-line text-gray-600"> <strong>Consigna: </strong>
          {redaccionBanco.find(q => q.id === redaccionSelected)?.consigna}
        </p>
        <textarea 
          value={redaccionText}
          onChange={(e) => setRedaccionText(e.target.value)}
          placeholder="Escribe tu respuesta aquí..."
                      className="w-full h-64 p-4 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg"
                    />
                  </div>
                )}
              </div>
            )}

{alertDiv && (
      <div className="mb-4 p-4 bg-gray-100 border border-gray-500 text-gray-700 rounded-lg font-semibold animate-pulse-scale-small">
        {alertDiv}
      </div>
    )}

          {violationMessage && (
      <div className="mb-4 p-4 bg-red-100 border border-red-500 text-red-700 rounded-lg font-semibold animate-pulse-scale">
        {violationMessage}
      </div>
    )}
            
            <div className="flex justify-end pt-6 border-t-2 border-gray-100">
              <button 
                onClick={() => {
                  if (showWriting) {
                    setShowWriting(false); // Vuelve de redacción a la última pregunta
                  } else if (currentQ > 0) {
                    setCurrentQ(prev => prev - 1);
                    setSelected(answers[currentQ - 1] ?? null);
                  }
                }}
                disabled={(currentQ === 0 && !showWriting) || proctorLocked}
                className={`px-12 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all transform ${
                  currentQ === 0
                    ? 'bg-card-400 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white shadow-gray-500/50 hover:shadow-gray-500/75 hover:scale-[1.05]'
                } btn-nav`}
              >
                ← Anterior
              </button>
              
              <button 
                onClick={handleNext}
                disabled={(!showWriting && (selected === null || proctorViolations >= MAX_VIOLATIONS)) || (showWriting && !redaccionSelected) || savingAnswer}
                className={`px-12 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all transform ${
                  selected === null || savingAnswer
                    ? 'bg-gray-400 text-gray-500 cursor-not-allowed shadow-none'
                    : 'btn-primary hover:scale-[1.05] shadow-2xl'
                } ${savingAnswer ? 'opacity-50 cursor-wait' : ''} btn-nav`}
              >
                {showWriting // {currentQ < currentQuestions.length - 1 ? `Siguiente (${currentQ + 2})` : '🎯 Finalizar Examen' } 
? '🎯 Finalizar Examen' 
    : (currentQ < currentQuestions.length - 1 
        ? `Siguiente (${currentQ + 2})` 
        : (asignaturasSinRedaccion.includes(selectedAsignatura) 
            ? '🎯 Finalizar Examen' 
            : 'Ir a Redacción')
      )
  }
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====== RESULTADO FINAL ======
  if (finished) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-12 text-center border-8 border-emerald-200">
          <h1 className="text-5xl font-black text-gray-900 mb-6">
            📊 Examen Finalizado
          </h1>
          
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-8 mb-8 shadow-inner">
            <div className="mt-6 p-4 bg-white rounded-xl shadow-sm">
              <p className="text-gray-700 font-semibold">
                ⏱️ Tiempo utilizado: <span className="font-black text-indigo-600">{formatTime(3600 - timeLeft)}</span>
              </p>
            </div>
          </div>
          
          <p className="text-xl text-gray-600 mb-8 max-w-md mx-auto">
            Tus respuestas han sido registradas exitosamente. El equipo administrativo te contactará pronto.
          </p>
          
          <button 
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black py-5 px-12 rounded-2xl shadow-2xl text-xl transition-all hover:shadow-3xl hover:scale-105"
          >
            Finalizar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
