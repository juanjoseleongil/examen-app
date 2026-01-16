import React, { useState, useEffect, useCallback } from 'react';
import { Clock, User, Monitor, Play, Shield } from 'lucide-react'; //CheckCircle, AlertCircle, 
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
}
interface ActiveSession {
  id: string; // ID del documento en Firestore
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
  const [mode, setMode] = useState < 'select' | 'exam' | 'admin' | 'admin-login' > ('select');
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState < Record < number, number >> ({});
  const [selected, setSelected] = useState < number | null > (null);
  const [timeLeft, setTimeLeft] = useState(3600);
  const [candidateName, setCandidateName] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [results, setResults] = useState < ExamResult[] > ([]);
  const [activeSessions, setActiveSessions] = useState < ActiveSession[] > ([]);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [sessionId, setSessionId] = useState < string | null > (null);
  const [expandedResultId, setExpandedResultId] = useState < string | null > (null);
  const [startingExam, setStartingExam] = useState(false);
  const [proctorViolations, setProctorViolations] = useState(0); // Conteo de violaciones
  const [proctorLocked, setProctorLocked] = useState(false); // Bloqueo permanente si >3
  const [proctorWarningShown, setProctorWarningShown] = useState(false); // Para mostrar alerta solo una vez por violación
  const [justHandledViolation, setJustHandledViolation] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const [selectedAsignatura, setSelectedAsignatura] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState(questionsMAT); // Default a Matemática
  const [redaccionText, setRedaccionText] = useState('');
  const [redaccionSelected, setRedaccionSelected] = useState < number | null > (null);
  
  //FUNCIONES LÓGICAS
  const calculateScore = useCallback((ans: Record<number, number>) => {
  let correct = 0;
  const details: QuestionDetail[] = [];
  currentQuestions.forEach((q, i) => {
    const userAnswer = ans[i];
    const isCorrect = userAnswer === q.correct;
    if (isCorrect) correct++;
    details.push({
      question: q.id,
      userAnswer: userAnswer ?? undefined,
      correctAnswer: q.correct,
      isCorrect,
      questionText: q.question,
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

const finishExam = useCallback(async () => {
  const score = calculateScore(answers);
  const newResult: Omit<ExamResult, 'id'> = {
    name: candidateName,
    idNumber: candidateId,
    date: new Date().toISOString(),
    timeUsed: formatTime(3600 - timeLeft),
    ip: await fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => data.ip)
      .catch(() => 'IP no disponible'),
    userAgent: navigator.userAgent,
    correct: score.correct,
    total: score.total,
    pct: score.pct,
    passed: score.passed,
    details: score.details,
    violations: proctorViolations,
    asignatura: selectedAsignatura,
    redaccion: redaccionText.trim(),
  };

  try {
    await addDoc(collection(db, "results"), newResult);
    if (sessionId) {
      await deleteDoc(doc(db, "activeSessions", sessionId));
    }
  } catch (error) {
    console.error("Error finalizando:", error);
    alert("Error al guardar.");
  }
  
  if (proctorViolations >= MAX_VIOLATIONS) {
    await addDoc(collection(db, "bannedCandidates"), {
      idNumber: candidateId.trim().toLowerCase(),
      bannedAt: new Date().toISOString(),
      violations: proctorViolations,
      reason: "Exceso en cambios de pestaña/ventana/minimización"
    });
  }

  setFinished(true);
  setProctoringActive(false);
}, [calculateScore, answers, candidateName, candidateId, timeLeft, proctorViolations, selectedAsignatura, redaccionText, sessionId]);

  // TODOS LOS EFFECTS AL INICIO, CON LÓGICA CONDICIONAL DENTRO
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
    getDocs(q).then((querySnapshot) => {
      const loadedResults = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ExamResult[];
      setResults(loadedResults);
    }).catch((error) => console.error("Error loading results:", error)).finally(() => setLoadingResults(false));
  }, [mode, isAdminLoggedIn]);
  useEffect(() => {
    if (mode !== 'admin' || !isAdminLoggedIn) return;
    const q = query(collection(db, "activeSessions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ActiveSession[];
      setActiveSessions(sessions);
    });
    return () => unsubscribe();
  }, [mode, isAdminLoggedIn]);
  useEffect(() => {
    if (!sessionId || !started || finished) return;
    const updateSession = async () => {
      try {
        await updateDoc(doc(db, "activeSessions", sessionId), {
          currentQuestion: currentQ + 1,
          timeLeft,
          lastActivity: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error updating session:", error);
      }
    };
    updateSession();
    document.body.style.userSelect = 'none'; //agregado para evitar selección por parte del usuario
  }, [currentQ, timeLeft, sessionId, started, finished]);
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
          // Delay de 5 segundos antes de finalizar
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
  }, [started, finished, proctorLocked, proctorWarningShown, justHandledViolation, finishExam]); // <-- Añadidos los dos últimos
  const [savingAnswer, setSavingAnswer] = useState(false);
  const handleNext = async () => {
    setViolationMessage(''); // Limpia mensaje de violación (ya lo tienes)
    if (selected === null) return;
    // Validación de redacción SOLO en la última pregunta
    if (currentQ === currentQuestions.length - 1) {
      if (!redaccionSelected) {
        alert("Debe seleccionar una consigna de redacción antes de finalizar.");
        return;
      }
      if (redaccionText.trim().length < 200) {
        alert("La redacción debe tener al menos 200 caracteres. Por favor complete su respuesta.");
        return;
      }
    }
    // Tu lógica actual de guardado
    setSavingAnswer(true);
    setAnswers(prev => ({ ...prev, [currentQ]: selected })); // guardar
    await new Promise(resolve => setTimeout(resolve, 0)); // esperar el siguiente render
    setSavingAnswer(false);
    // Avanzar o finalizar
    if (currentQ < currentQuestions.length - 1) {
      setCurrentQ((prev) => prev + 1);
      setSelected(null);
    } else {
      finishExam();
    }
  };
  
  // ====== RENDER (TODOS LOS RETURNS AQUÍ) ======
  if (mode === 'select') {
    return ( < div className = "min-h-screen bg-main p-6"
      id = "examen-container"
      onCopy = {
        (e) => e.preventDefault() } onContextMenu = {
        (e) => e.preventDefault() } onMouseDown = {
        (e) => {
              // Opcional: evita selección con mouse en desktop
    if (e.button === 0) e.preventDefault();
  }}
      >
        <div className="max-w-4xl w-full bg-card rounded-3xl shadow-2xl p-16 text-center border-8 border-indigo-200"> < h1 className = "text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight" > Prueba de conocimientos específicos </h1> < div className = "grid grid-cols-1 md:grid-cols-2 gap-8" > < button onClick = {
        () => setMode('exam') } className = "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-8 px-6 md:px-16 rounded-3xl shadow-2xl text-2xl md:text-3xl transition-all hover:shadow-3xl hover:scale-105 flex flex-col items-center justify-center min-h-[180px] whitespace-normal break-words text-center" > < Play className = "w-12 h-12 mb-4" / > PROFE </button> < button onClick = {
        () => setMode('admin-login') } className = "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-8 px-6 md:px-16 rounded-3xl shadow-2xl text-2xl md:text-3xl transition-all hover:shadow-3xl hover:scale-105 flex flex-col items-center justify-center min-h-[180px] whitespace-normal break-words text-center" > < Shield className = "w-12 h-12 mb-4" / > ADMINISTRADOR </button> </div> </div> </div>);
  }
  if (mode === 'admin-login') {
    return ( < div data-screen = "candidate-info"
      className = "min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center" > < div className = "bg-card rounded-3xl shadow-2xl p-12 border-8 border-purple-200 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" > < h1 className = "text-5xl md:text-6xl font-black text-gray-900 dark:text-white break-words" > { /* ← Agrega break-words */ } Panel Administrador </h1> < input type = "email"
      value = { adminEmail } onChange = {
        (e) => setAdminEmail(e.target.value) } placeholder = "Email administrador"
      pattern = "[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
      title = "Ingresa un correo válido (ej. ejemplo@dominio.com)"
      className = "w-full p-4 mb-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none" / > < input type = "password"
      value = { adminPassword } onChange = {
        (e) => setAdminPassword(e.target.value) } placeholder = "Contraseña"
      className = "w-full p-4 mb-8 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none" / > < button onClick = {
        async () => {
          try {
            await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
            setIsAdminLoggedIn(true);
            setMode('admin');
          } catch (error: any) {
            alert("Error de login: " + error.message);
          }
        }
      }
      className = "w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-4 rounded-xl shadow-2xl text-xl transition-all hover:shadow-3xl hover:scale-105" > Iniciar Sesión </button> </div> </div>);
  }
  if (mode === 'admin') {
    return ( < div className = "min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-8" > < div className = "max-w-7xl mx-auto" > < div className = "flex justify-between items-center mb-8" > < h1 className = "text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight" > Panel Administrador </h1> < button onClick = {
        async () => {
          await signOut(auth);
          setIsAdminLoggedIn(false);
          setMode('select');
        }
      }
      className = "bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg" > Cerrar Sesión </button> </div> { /* PROFESORES EN VIVO */ } < div className = "mb-12" > < h2 className = "text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4" > < Monitor className = "w-10 h-10 mr-4 text-emerald-600" / > Profesores en vivo({ activeSessions.length }) </h2> {
        activeSessions.length === 0 ? ( < p className = "text-xl text-gray-600" > No hay profesores activos en este momento. </p>) : ( < div className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" > {
          activeSessions.map(session => ( < div key = { session.id } className = "bg-card rounded-2xl shadow-xl p-6 border-l-4 border-emerald-500" > < div className = "flex items-center justify-between mb-4" > < h3 className = "text-2xl md:text-3xl font-semibold text-accent mb-4" > { session.name } </h3> < span className = "bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse" > ACTIVO </span> </div> < p className = "text-gray-600 mb-2" > Cédula: { session.idNumber } </p> < p className = "text-lg font-semibold mb-2" > Pregunta: < span className = "text-indigo-600" > { session.currentQuestion }
            /{currentQuestions.length}</span > </p> < p className = "text-lg font-semibold mb-2" > Tiempo restante: < span className = "text-red-600" > { formatTime(session.timeLeft) } </span> </p> < p className = "text-sm text-gray-500" > Última actividad: { session.lastActivity?.toDate?.().toLocaleTimeString() || 'Ahora' } </p> </div>))
        } </div>)
      } </div> { /* RESULTADOS FINALIZADOS */ } < h2 className = "text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4" > Resultados finalizados </h2> {
        loadingResults ? ( < p className = "text-center text-2xl" > Cargando resultados... </p>) : results.length === 0 ? ( < p className = "text-center text-2xl text-gray-600" > No hay resultados aún. </p>) : ( < div className = "bg-card rounded-3xl shadow-2xl overflow-hidden" > < table className = "w-full" > < thead className = "bg-gradient-to-r from-purple-600 to-pink-600 text-white" > < tr > < th className = "p-6 text-left" > Nombre </th> < th className = "p-6 text-left" > Cédula </th> < th className = "p-6 text-left" > Asignatura </th> < th className = "p-6 text-left" > Fecha </th> < th className = "p-6 text-center" > Correctas </th> < th className = "p-6 text-center" > Porcentaje </th> < th className = "p-6 text-center" > Estado </th> < th className = "p-6 text-center" > Tiempo </th> < th className = "p-6 text-center" > Violaciones </th> < th className = "p-6 text-center" > Detalles </th> </tr> </thead> < tbody > {
          results.map((r) => ( < > < tr key = { r.id } className = "border-b hover:bg-card-50" > < td className = "p-6" > { r.name } </td> < td className = "p-6" > { r.idNumber } </td> < td className = "p-6" > { r.asignatura } </td> < td className = "p-6" > { new Date(r.date).toLocaleString('es-CO') } </td> < td className = "p-6 text-center" > { r.correct }
            /{r.total}</td > < td className = "p-6 text-center font-bold"
            style = { { color: r.passed ? '#059669' : '#dc2626' } } > { r.pct } % </td> < td className = "p-6 text-center font-bold" > { r.passed ? 'APROBADO' : 'NO APROBADO' } </td> < td className = "p-6 text-center" > { r.timeUsed } </td> < td className = "p-6 text-center font-bold"
            style = { { color: r.violations > 0 ? '#dc2626' : '#059669' } } > { r.violations || 0 } </td> < td className = "p-6 text-center" > < button onClick = {
              () => setExpandedResultId(expandedResultId === r.id ? null : r.id) } className = "bg-indigo-600 text-white py-1 px-3 rounded-lg hover:bg-indigo-700" > { expandedResultId === r.id ? 'Ocultar' : 'Ver Detalles' } </button> </td> </tr> {
              expandedResultId === r.id && ( < tr > < td colSpan = { 10 } className = "p-6 bg-card-50" > < div className = "max-h-96 overflow-y-auto" > < h3 className = "text-2xl font-bold mb-6" > Detalles por Grado </h3> { /* Subgrupos por grado */ } {
                  Array.from({ length: 9 }, (_, groupIndex) => {
                    const groupStart = groupIndex * 5;
                    const groupDetails = r.details.slice(groupStart, groupStart + 5);
                    const groupCorrect = groupDetails.filter(d => d.isCorrect).length;
                    const groupTotal = 5;
                    const groupPct = (groupCorrect / groupTotal) * 100;
                    return ( < div key = { groupIndex } className = "mb-10 pb-6 border-b border-gray-200 last:border-b-0" > < h4 className = "text-xl font-semibold mb-4" > Grado { groupIndex + 1 }° </h4> < div className = "flex items-center justify-center mb-6" > < svg viewBox = "0 0 36 36"
                      className = "w-32 h-32" > < path d = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill = "none"
                      stroke = "#e5e7eb"
                      strokeWidth = "3" / > < path d = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill = "none"
                      stroke = "#10b981"
                      strokeWidth = "3"
                      strokeDasharray = { `${groupPct}, 100` }
                      /> < text x = "18"
                      y = "20.5"
                      textAnchor = "middle"
                      fontSize = "10"
                      fill = "#374151" > { groupPct.toFixed(1) } % </text> </svg> </div> < table className = "w-full table-auto" > < thead > < tr className = "bg-gray-100" > < th className = "p-3 text-left" > Pregunta </th> < th className = "p-3 text-center" > Respuesta </th> < th className = "p-3 text-center" > Correcta </th> < th className = "p-3 text-center" > ¿Acertó ? </th> </tr> </thead> < tbody > {
                        groupDetails.map((detail, index) => ( < tr key = { index } className = "border-b last:border-b-0" > < td className = "p-3" > { detail.questionText.slice(0, 60) }... </td> < td className = "p-3 text-center" > { detail.userAnswer !== undefined ? String.fromCharCode(65 + detail.userAnswer) : '-' } </td> < td className = "p-3 text-center" > { String.fromCharCode(65 + detail.correctAnswer) } </td> < td className = "p-3 text-center font-bold"
                          style = { { color: detail.isCorrect ? '#059669' : '#dc2626' } } > { detail.isCorrect ? 'Sí' : 'No' } </td> </tr>))
                      } </tbody> </table> </div>);
                  })
                } { /* Diagrama acumulado final */ } < div className = "mt-8 pt-6 border-t border-gray-200" > < h4 className = "text-xl font-semibold mb-4 text-center" > Resultado Acumulado </h4> < div className = "flex items-center justify-center" > < svg viewBox = "0 0 36 36"
                className = "w-40 h-40" > < path d = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill = "none"
                stroke = "#e5e7eb"
                strokeWidth = "4" / > < path d = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill = "none"
                stroke = "#10b981"
                strokeWidth = "4"
                strokeDasharray = { `${parseFloat(r.pct)}, 100` }
                /> < text x = "18"
                y = "21"
                textAnchor = "middle"
                fontSize = "12"
                fontWeight = "bold"
                fill = "#111827" > { r.pct } % </text> </svg> </div> </div> { /* Redacción final */ } < div className = "mt-8 pt-6 border-t border-gray-200" > < h4 className = "text-xl font-semibold mb-4" > Redacción Final </h4> < div className = "p-6 bg-gray-50 rounded-lg whitespace-pre-line text-gray-800" > { r.redaccion || 'No se redactó respuesta.' } </div> </div> </div> </td> </tr>)
            } </>))
        } </tbody> </table> </div>)
      } </div> </div>);
  }
  // ====== EXAMEN (PROFESOR) ======
  if (!started) {
    return ( < div data-screen = "candidate-info"
      className = "min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center"
      id = "exc2"
      onCopy = {
        (e) => e.preventDefault() } onContextMenu = {
        (e) => e.preventDefault() } > < div className = "max-w-2xl w-full bg-card rounded-3xl shadow-2xl p-12 text-center border-8 border-indigo-200" > < h1 className = "text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight" > Datos del Profesor </h1> < input type = "text"
      value = { candidateName } onChange = {
        (e) => {
          const value = e.target.value.normalize("NFD") // descompone acentos
            .replace(/[\u0300-\u036f]/g, "") // quita marcas de acento
            .replace(/[^a-zA-ZñÑ\s]/g, ""); // solo letras, ñ/Ñ y espacios
          setCandidateName(value);
        }
      }
      placeholder = "Nombre completo"
      className = "form-input" / > < input type = "text"
      value = { candidateId } onChange = {
        (e) => {
          const value = e.target.value.replace(/\D/g, ""); // solo dígitos
          // Limitar longitud (máx 10 dígitos)
          if (value.length <= 10) {
            setCandidateId(value);
          }
        }
      }
      onBlur = {
        () => {
          // Validación final al salir del campo
          const num = parseInt(candidateId, 10);
          if (candidateId && (num < 1000000 || num > 9999999999)) {
            alert("El número de documento debe tener entre 7 y 10 dígitos.");
            setCandidateId("");
          }
        }
      }
      placeholder = "Número de cédula"
      className = "form-input" / > < select value = { selectedAsignatura } onChange = {
        (e) => setSelectedAsignatura(e.target.value) } className = "form-input" > < option value = "" > Seleccione la asignatura </option> < option value = "Ciencias Naturales" > Ciencias Naturales </option> < option value = "Ciencias Sociales" > Ciencias Sociales </option> < option value = "Artística" > Artística </option> < option value = "Ética y Religión" > Ética y Religión </option> < option value = "Educación Física" > Educación Física </option> < option value = "Lengua Castellana" > Lengua Castellana </option> < option value = "Lengua Extranjera" > Lengua Extranjera </option> < option value = "Matemática" > Matemática </option> < option value = "Tecnología" > Tecnología </option> < option value = "Servicios generales" > Servicios generales </option> < option value = "Conductor de transporte escolar" > Conductor de transporte escolar </option> < option value = "Auxiliar contable" > Auxiliar contable </option> </select> < button onClick = {
        async () => {
          const bannedQuery = query(collection(db, "bannedCandidates"), where("idNumber", "==", candidateId.trim().toLowerCase()));
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
              loadedQuestions = questionsMAT; // Fallback a Matemática
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
          // No es necesario setStartingExam(false) aquí porque ya cambia de pantalla
        }
      }
      disabled = {!candidateName || !candidateId || !selectedAsignatura || startingExam } className = { `w-full py-6 rounded-2xl font-black text-2xl shadow-2xl transition-all transform ${
    !candidateName || !candidateId || startingExam
      ? 'bg-gray-400 text-gray-500 cursor-not-allowed shadow-none'
      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer'
  } ${startingExam ? 'scale-95 opacity-75 cursor-wait' : ''}` } > {
        startingExam ? ('Iniciando...') : ( < > < Play className = "w-10 h-10 mr-4 inline" / > INICIAR EXAMEN </>)
      } </button> </div> </div>);
  }
  if (started && !finished) {
    const q = currentQuestions[currentQ];
    const prog = ((currentQ + 1) / currentQuestions.length) * 100;
    return ( < div className = "min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-6"
      id = "exc3"
      onCopy = {
        (e) => e.preventDefault() } onContextMenu = {
        (e) => e.preventDefault() } onMouseDown = {
        (e) => {
          // Opcional: evita selección con mouse en desktop
          if (e.button === 0) e.preventDefault();
        }
      } > < div className = "max-w-4xl mx-auto mb-8" > < div className = "bg-card backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-celeste/30" > < div className = "flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4" > < div className = "flex items-center gap-4" > < div className = "flex items-center bg-red-100 p-3 rounded-xl border-2 border-red-200 shadow-md" > < Clock className = "w-6 h-6 text-red-600 mr-2" / > < span className = "text-2xl font-mono font-bold text-red-700 tracking-wide" > { formatTime(timeLeft) } </span> </div> < div className = "bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-xl font-mono font-semibold text-indigo-900 shadow-inner" > Pregunta { currentQ + 1 } de { currentQuestions.length } </div> </div> < div className = "flex items-center gap-4 text-sm font-semibold text-gray-800 bg-card/60 px-4 py-2 rounded-xl shadow-sm" > < User size = { 18 }
      /> { candidateName } < span className = "ml-2 text-indigo-700 font-mono" > # { candidateId } </span> {
        proctoringActive && ( < div className = "flex items-center gap-1 bg-emerald-200 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse" > < Monitor size = { 14 }
          />
          Proctoring ON </div>)
      } </div> </div> < div className = "w-full bg-card-200 rounded-full h-3 shadow-inner" > < div className = "bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full shadow-lg transition-all duration-1000"
      style = { { width: `${prog}%` } }
      /> </div> </div> </div> < div className = "max-w-4xl mx-auto" > < div className = "bg-card/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-celeste/30" > < h2 className = "text-4xl md:text-5xl font-bold text-primary mb-8 flex items-center gap-4" > Pregunta { currentQ + 1 } </h2> {
        violationMessage && ( < div className = "mb-4 p-4 bg-red-100 border border-red-500 text-red-700 rounded-lg font-semibold animate-pulse-scale" > { violationMessage } </div>)
      } < div className = "w-16 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full mb-8"
      onTouchStart = {
        (e) => e.preventDefault() } onTouchEnd = {
        (e) => e.preventDefault() } > </div> < p className = "text-xl leading-relaxed text-gray-800 mb-10" > { q.question } </p> < div className = "space-y-4 mb-12" > {
        q.options.map((opt, i) => ( < button key = { i } onClick = {
          () => setSelected(i) } className = { `group relative w-full p-6 rounded-2xl border-3 font-medium text-left transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl ${
                  selected === i
                    ? 'border-indigo-500 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-indigo-200/50 scale-[1.02]'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 shadow-md'
                }` } > < div className = "flex items-center" > < div className = { `w-8 h-8 rounded-2xl border-4 mr-5 flex items-center justify-center font-bold text-sm shadow-md transition-all group-hover:scale-110 ${
                      selected === i
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-300/50'
                        : 'bg-card border-gray-300 text-gray-600 shadow-sm'
                    }` } > { String.fromCharCode(65 + i) } </div> < span className = "text-lg leading-relaxed" > { opt } </span> </div> </button>))
      } </div> {
        currentQ === currentQuestions.length - 1 && ( < div className = "mt-8" > < h3 className = "text-2xl font-bold mb-4" > Pregunta de Redacción Final </h3> { /* Selección de pregunta */ } {
          !redaccionSelected ? ( < div className = "mb-6" > < p className = "text-lg mb-4" > Seleccione una de las siguientes consignas para desarrollar: </p> < select value = ""
            onChange = {
              (e) => {
                const id = parseInt(e.target.value);
                setRedaccionSelected(id);
                const selected = redaccionBanco.find(q => q.id === id);
                if (selected) alert(`Consigna seleccionada:\n\n${selected.consigna}`);
              }
            }
            className = "w-full p-4 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg" > < option value = "" > --Seleccione una consigna-- </option> {
              redaccionBanco.map(q => ( < option key = { q.id } value = { q.id } > { q.titulo } </option>))
            } </select> </div>) : ( < div className = "mb-6" > < p className = "text-xl font-semibold mb-4" > { redaccionBanco.find(q => q.id === redaccionSelected)?.titulo } </p> < p className = "text-lg mb-4 whitespace-pre-line" > { redaccionBanco.find(q => q.id === redaccionSelected)?.consigna } </p> < textarea value = { redaccionText } onChange = {
              (e) => setRedaccionText(e.target.value) } placeholder = "Escribe tu respuesta aquí... (mínimo 200 palabras)"
            className = "w-full h-64 p-4 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg" / > </div>)
        } </div>)
      } < div className = "flex justify-end pt-6 border-t-2 border-gray-100" > < button onClick = {
        () => {
          if (currentQ > 0) {
            setCurrentQ(prev => prev - 1);
            setSelected(answers[currentQ - 1] ?? null);
          }
        }
      }
      disabled = { currentQ === 0 || proctorLocked } className = { `px-12 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all transform ${
      currentQ === 0
        ? 'bg-card-400 text-gray-500 cursor-not-allowed shadow-none'
        : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white shadow-gray-500/50 hover:shadow-gray-500/75 hover:scale-[1.05]'
    }` } > ←Anterior </button> < button onClick = { handleNext } disabled = { selected === null || savingAnswer } className = { `px-12 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all transform ${
  selected === null || savingAnswer
    ? 'bg-gray-400 text-gray-500 cursor-not-allowed shadow-none'
    : 'btn-primary hover:scale-[1.05] shadow-2xl'
} ${savingAnswer ? 'opacity-50 cursor-wait' : ''}` } > { currentQ < currentQuestions.length - 1 ? `Siguiente (${currentQ + 2})` : '🎯 Finalizar Examen' } </button> </div> </div> </div> </div>);
  }
  // ====== RESULTADO FINAL ======
  /*
  if (finished) {
    const score = calculateScore(answers);
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-card rounded-3xl shadow-2xl p-12 text-center border-8 border-emerald-200">
          <div className={`w-32 h-32 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl ${score.passed ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            {score.passed ? <CheckCircle className="w-20 h-20" /> : <AlertCircle className="w-20 h-20" />}
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-primary mb-6 tracking-tight">
            {score.passed ? '🎉 ¡FELICITACIONES!' : '📊 Resultados'}
          </h1>
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-8 mb-8 shadow-inner">
            <div className="grid grid-cols-2 gap-8 text-center">
              <div>
                <div className="text-4xl font-black text-gray-900 mb-2">{score.correct}/{score.total}</div>
                <div className="text-lg text-gray-600 font-semibold">Respuestas correctas</div>
              </div>
              <div>
                <div className="text-4xl font-black mb-2" style={{ color: score.passed ? '#059669' : '#dc2626' }}>
                  {score.pct}%
                </div>
                <div className="text-lg font-bold uppercase tracking-wide" style={{ color: score.passed ? '#059669' : '#dc2626' }}>
                  {score.passed ? 'APROBADO' : 'NO APROBADO'}
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-card rounded-xl shadow-sm">
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
  */
  if (finished) {
    return ( < div className = "min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 p-8 flex items-center justify-center" > < div className = "max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-12 text-center border-8 border-emerald-200" > < h1 className = "text-5xl font-black text-gray-900 mb-6" > 📊Examen Finalizado </h1> < div className = "bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-8 mb-8 shadow-inner" > < div className = "mt-6 p-4 bg-white rounded-xl shadow-sm" > < p className = "text-gray-700 font-semibold" > ⏱️Tiempo utilizado: < span className = "font-black text-indigo-600" > { formatTime(3600 - timeLeft) } </span> </p> </div> </div> < p className = "text-xl text-gray-600 mb-8 max-w-md mx-auto" > Tus respuestas han sido registradas exitosamente.El equipo administrativo te contactará pronto. </p> < button onClick = {
      () => window.location.reload() } className = "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black py-5 px-12 rounded-2xl shadow-2xl text-xl transition-all hover:shadow-3xl hover:scale-105" > Finalizar </button> </div> </div>);
  }
  return null; // No debería llegar aquí
}
