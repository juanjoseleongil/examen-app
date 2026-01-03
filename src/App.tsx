import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, User, Monitor, Play, Shield } from 'lucide-react';
import { db, auth } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// === TIPOS PERSONALIZADOS ===
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
}

const questions = [
  { id: 1, question: "Un docente trabaja el número 15 con material concreto, dibujos y símbolos. ¿Qué concepto matemático está fortaleciendo principalmente?", options: ["El cálculo algorítmico", "La noción de número", "La resolución de ecuaciones", "El pensamiento aleatorio"], correct: 1 },
  { id: 2, question: "Cuando un estudiante usa los números para decir quién llegó primero, segundo o tercero, está usando el número como:", options: ["Cardinal", "Código", "Ordinal", "Medida"], correct: 2 },
  { id: 3, question: "¿Cuál de las siguientes actividades es más adecuada para introducir la suma en grado primero?", options: ["Resolver operaciones escritas sin apoyo visual", "Memorizar tablas de sumar", "Unir colecciones de objetos concretos", "Resolver problemas con decimales"], correct: 2 },
  { id: 4, question: "Un docente pide a sus estudiantes que representen el número 23 en el ábaco. Esta actividad favorece principalmente:", options: ["La memorización de cifras", "El valor posicional", "La comparación de fracciones", "El pensamiento variacional"], correct: 1 },
  { id: 5, question: "¿Cuál situación evidencia el uso del número como medida?", options: ["Contar cuántos lápices hay en el estuche", "Decir el número del salón", "Medir cuántos pasos hay del tablero a la puerta", "Decir quién ocupa el tercer puesto"], correct: 2 },
  { id: 6, question: "Un estudiante representa el número 34.572 identificando unidades, decenas, centenas y millares. ¿Qué concepto está fortaleciendo principalmente el docente?", options: ["La seriación", "El valor posicional", "La estimación", "La medición"], correct: 1 },
  { id: 7, question: "¿Cuál situación es más adecuada para evaluar la sustracción en un contexto significativo para grado segundo?", options: ["Resolver restas con números negativos", "Quitar elementos de una colección concreta", "Memorizar resultados", "Resolver ecuaciones"], correct: 1 },
  { id: 8, question: "Cuando un docente introduce la multiplicación como suma repetida, está favoreciendo:", options: ["El cálculo mecánico", "La comprensión conceptual", "La memorización de tablas", "El pensamiento algebraico avanzado"], correct: 1 },
  { id: 9, question: "¿Cuál de las siguientes actividades permite evaluar mejor la división en grado segundo?", options: ["Resolver divisiones con residuo grande", "Repartir equitativamente objetos entre varios estudiantes", "Resolver ejercicios escritos extensos", "Memorizar el algoritmo"], correct: 1 },
  { id: 10, question: "El uso del reloj para identificar horas y medias horas fortalece principalmente el pensamiento:", options: ["Numérico", "Aleatorio", "Métrico", "Variacional"], correct: 2 },
  { id: 11, question: "Un docente trabaja problemas donde los estudiantes deben explicar cómo resolvieron una operación. Esta estrategia fortalece principalmente:", options: ["El cálculo mecánico", "La memorización", "El razonamiento matemático", "La velocidad operativa"], correct: 2 },
  { id: 12, question: "Cuando un estudiante compara fracciones como 1/2 y 1/4 usando material concreto, se está priorizando:", options: ["El algoritmo de fracciones", "La comprensión del significado de la fracción", "La memorización de reglas", "El uso de números decimales"], correct: 1 },
  { id: 13, question: "¿Cuál actividad es más adecuada para introducir el concepto de perímetro en grado tercero?", options: ["Resolver fórmulas escritas", "Medir el contorno de objetos reales", "Calcular áreas complejas", "Memorizar definiciones"], correct: 1 },
  { id: 14, question: "El uso de problemas que combinan multiplicación y división favorece principalmente:", options: ["El pensamiento aleatorio", "La mecanización del cálculo", "La comprensión de relaciones entre operaciones", "El aprendizaje memorístico"], correct: 2 },
  { id: 15, question: "Cuando los estudiantes organizan datos en tablas o gráficos sencillos, el pensamiento que se fortalece es:", options: ["Numérico", "Espacial", "Aleatorio", "Variacional"], correct: 2 },
  { id: 16, question: "Un docente propone problemas donde los estudiantes deben identificar múltiplos y divisores de un número en situaciones cotidianas. ¿Qué pensamiento matemático se fortalece principalmente?", options: ["Aleatorio", "Numérico", "Espacial", "Variacional"], correct: 1 },
  { id: 17, question: "¿Cuál estrategia es más pertinente para introducir las fracciones equivalentes en grado cuarto?", options: ["Memorizar reglas de amplificación", "Usar representaciones gráficas de una misma cantidad", "Resolver operaciones algebraicas", "Trabajar solo con ejercicios escritos"], correct: 1 },
  { id: 18, question: "Cuando un estudiante reconoce que 0,5 y 1/2 representan la misma cantidad, está demostrando:", options: ["Dominio del algoritmo", "Comprensión de equivalencia numérica", "Uso de porcentajes", "Cálculo mental avanzado"], correct: 1 },
  { id: 19, question: "El cálculo del perímetro y el área de figuras planas contribuye principalmente al desarrollo del pensamiento:", options: ["Numérico", "Aleatorio", "Métrico", "Variacional"], correct: 2 },
  { id: 20, question: "Un docente pide construir figuras con material manipulativo para analizar sus propiedades. Esta estrategia favorece:", options: ["El aprendizaje memorístico", "El pensamiento geométrico", "El cálculo automático", "La repetición de fórmulas"], correct: 1 },
  { id: 21, question: "Un docente propone problemas donde los estudiantes comparan fracciones y decimales en situaciones reales. Esta estrategia fortalece principalmente:", options: ["La memorización de reglas", "La comprensión de la equivalencia numérica", "El cálculo automático", "El pensamiento aleatorio"], correct: 1 },
  { id: 22, question: "El uso de potenciación en grado quinto tiene como propósito principal:", options: ["Introducir el álgebra avanzada", "Repetir sumas de manera abreviada", "Memorizar fórmulas", "Resolver ecuaciones"], correct: 1 },
  { id: 23, question: "Cuando un estudiante ubica puntos en el plano cartesiano, está desarrollando principalmente:", options: ["Pensamiento aleatorio", "Pensamiento numérico", "Pensamiento espacial", "Pensamiento métrico"], correct: 2 },
  { id: 24, question: "El trabajo con ángulos y sus medidas fortalece el pensamiento:", options: ["Numérico", "Variacional", "Métrico", "Aleatorio"], correct: 2 },
  { id: 25, question: "Un docente utiliza situaciones de la vida diaria para introducir igualdades y desigualdades. ¿Qué se busca principalmente?", options: ["Uso mecánico de símbolos", "Comprensión del lenguaje matemático", "Memorización de signos", "Cálculo rápido"], correct: 1 },
  { id: 26, question: "Un estudiante inicia el día con una deuda de $15.000. Luego paga $9.000 y más tarde adquiere una nueva deuda de $6.000. ¿Cuál es su situación final?", options: ["Debe $12.000", "Debe $6.000", "No debe nada", "Tiene $6.000 a favor"], correct: 1 },
  { id: 27, question: "La temperatura a las 6:00 a. m. es de −4 °C. Al mediodía sube 11 °C y en la noche baja 5 °C. ¿Cuál es la temperatura final?", options: ["2 °C", "−2 °C", "7 °C", "−10 °C"], correct: 0 },
  { id: 28, question: "En una papelería, 4 cuadernos cuestan $10.000. Si el precio es proporcional, ¿cuánto cuestan 10 cuadernos?", options: ["$20.000", "$22.500", "$25.000", "$30.000"], correct: 2 },
  { id: 29, question: "Un rectángulo tiene largo de 12 cm y ancho de 7 cm. ¿Cuál es su perímetro?", options: ["38 cm", "76 cm", "84 cm", "19 cm"], correct: 0 },
  { id: 30, question: "En un curso hay 18 niñas y 12 niños. Si se quiere formar grupos de 5 estudiantes, ¿cuántos grupos completos se pueden formar?", options: ["5", "6", "7", "8"], correct: 1 },
  { id: 31, question: "Para preparar una mezcla se usan 3 litros de agua por cada 2 litros de concentrado. Si se necesitan 15 litros de agua, ¿cuántos litros de concentrado se deben usar?", options: ["8", "9", "10", "12"], correct: 2 },
  { id: 32, question: "Un carro recorre 180 km en 3 horas a velocidad constante. ¿Cuánto tiempo tardará en recorrer 300 km manteniendo la misma velocidad?", options: ["4 horas", "4,5 horas", "5 horas", "6 horas"], correct: 2 },
  { id: 33, question: "Un terreno rectangular tiene área de 96 m² y uno de sus lados mide 12 m. ¿Cuánto mide el otro lado?", options: ["6 m", "8 m", "10 m", "14 m"], correct: 1 },
  { id: 34, question: "Para construir una maqueta, la escala es 1 : 50. Si una pared mide 4 m en la realidad, ¿cuánto mide en la maqueta?", options: ["4 cm", "6 cm", "8 cm", "10 cm"], correct: 2 },
  { id: 35, question: "En una fábrica, 8 operarios realizan un trabajo en 12 días. Si se contratan 12 operarios, ¿en cuántos días se realizará el mismo trabajo?", options: ["6", "8", "10", "18"], correct: 1 },
  { id: 36, question: "Un número aumentado en 7 es igual a 3 veces ese número disminuido en 5. ¿Cuál es el número?", options: ["4", "6", "8", "11"], correct: 3 },
  { id: 37, question: "Una camisa cuesta $60.000 y se le aplica un descuento del 20%. Luego se le aplica un IVA del 19% sobre el precio con descuento. ¿Cuál es el precio final?", options: ["$45.600", "$49.000", "$57.120", "$61.200"], correct: 2 },
  { id: 38, question: "Un rectángulo tiene base (x + 4) y altura (x − 2). Si el área es 48 unidades², ¿cuál es el valor de x?", options: ["4", "6", "8", "12"], correct: 1 },
  { id: 39, question: "La suma de tres números consecutivos es 72. ¿Cuál es el número mayor?", options: ["22", "23", "24", "25"], correct: 3 },
  { id: 40, question: "Un cuadrado tiene perímetro de 40 cm. ¿Cuál es su área?", options: ["25 cm²", "64 cm²", "100 cm²", "160 cm²"], correct: 2 },
  { id: 41, question: "La suma de dos números es 30 y su diferencia es 6. ¿Cuáles son los números?", options: ["12 y 18", "14 y 16", "18 y 12", "24 y 6"], correct: 2 },
  { id: 42, question: "Un rectángulo tiene perímetro de 52 cm. La base mide 4 cm más que la altura. ¿Cuánto mide la base?", options: ["13 cm", "14 cm", "15 cm", "16 cm"], correct: 2 },
  { id: 43, question: "La función que representa el costo ( C ) de un servicio es ( C(x) = 8.000x + 12.000 ), donde ( x ) es el número de horas. ¿Cuál es el costo por 5 horas?", options: ["$40.000", "$52.000", "$60.000", "$68.000"], correct: 1 },
  { id: 44, question: "Un cuadrado tiene un área de 81 cm². ¿Cuál es el perímetro del cuadrado?", options: ["18 cm", "24 cm", "32 cm", "36 cm"], correct: 3 },
  { id: 45, question: "En una encuesta, el 40% de los estudiantes son mujeres. Si participaron 120 estudiantes, ¿cuántos son hombres?", options: ["40", "48", "72", "80"], correct: 2 }
];

export default function MathExam() {
  const [mode, setMode] = useState<'select' | 'exam' | 'admin' | 'admin-login'>('select');
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutos
  const [candidateName, setCandidateName] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [results, setResults] = useState<ExamResult[]>([]);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  // Verificar estado de autenticación al cargar la app
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAdminLoggedIn(true);
        if (mode === 'admin') loadResults();
      } else {
        setIsAdminLoggedIn(false);
      }
    });
    return () => unsubscribe();
  }, [mode]);

  // Temporizador del examen
  useEffect(() => {
    if (started && !finished && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            finishExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [started, finished, timeLeft]);

  // Cargar resultados desde Firestore cuando el admin está logueado
  const loadResults = async () => {
    setLoadingResults(true);
    try {
      const q = query(collection(db, "results"), orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      const loadedResults = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ExamResult[];
      setResults(loadedResults);
    } catch (error) {
      console.error("Error cargando resultados:", error);
    }
    setLoadingResults(false);
  };

  useEffect(() => {
    if (mode === 'admin' && isAdminLoggedIn) {
      loadResults();
    }
  }, [mode, isAdminLoggedIn]);

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const calculateScore = (ans: Record<number, number>) => {
    let correct = 0;
    const details: QuestionDetail[] = [];

    questions.forEach((q, i) => {
      const userAnswer = ans[i];
      const isCorrect = userAnswer === q.correct;
      if (isCorrect) correct++;
      details.push({
        question: q.id,
        userAnswer: userAnswer ?? null,
        correctAnswer: q.correct,
        isCorrect,
        questionText: q.question,
      });
    });

    const pct = (correct / questions.length) * 100;
    return {
      correct,
      total: questions.length,
      pct: pct.toFixed(1),
      passed: pct >= 70,
      details,
    };
  };

  const handleNext = () => {
    if (selected === null) return;
    setAnswers((prev) => ({ ...prev, [currentQ]: selected }));
    if (currentQ < questions.length - 1) {
      setCurrentQ((prev) => prev + 1);
      setSelected(null);
    } else {
      finishExam();
    }
  };

  const finishExam = async () => {
    const score = calculateScore(answers);
    const newResult: Omit<ExamResult, 'id'> = {
      name: candidateName,
      idNumber: candidateId,
      date: new Date().toISOString(),
      timeUsed: formatTime(3600 - timeLeft),
      ip: 'Simulada (producción: usaría IP real)',
      userAgent: navigator.userAgent,
      correct: score.correct,
      total: score.total,
      pct: score.pct,
      passed: score.passed,
      details: score.details,
    };

    try {
      await addDoc(collection(db, "results"), newResult);
    } catch (error) {
      console.error("Error guardando resultado:", error);
      alert("Hubo un error al guardar el resultado. Revisa la consola.");
    }

    setFinished(true);
    setProctoringActive(false);
  };

  // ====== PANTALLA DE SELECCIÓN ======
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl p-16 text-center border-8 border-indigo-200">
          <h1 className="text-5xl font-black text-gray-900 mb-12">Examen de Admisión - Matemáticas</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <button
              onClick={() => setMode('exam')}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-8 px-16 rounded-3xl shadow-2xl text-3xl transition-all hover:shadow-3xl hover:scale-105"
            >
              <Play className="w-12 h-12 mx-auto mb-4" />
              CANDIDATO
            </button>
            <button
              onClick={() => setMode('admin-login')}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-8 px-16 rounded-3xl shadow-2xl text-3xl transition-all hover:shadow-3xl hover:scale-105"
            >
              <Shield className="w-12 h-12 mx-auto mb-4" />
              ADMINISTRADOR
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====== LOGIN ADMINISTRADOR ======
  if (mode === 'admin-login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-12 border-8 border-purple-200">
          <h1 className="text-4xl font-black text-gray-900 mb-8 text-center">Panel Administrador</h1>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="Email administrador"
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

  // ====== PANEL ADMINISTRADOR ======
  if (mode === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-5xl font-black text-gray-900">Panel Administrador</h1>
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

          {loadingResults ? (
            <p className="text-center text-2xl">Cargando resultados...</p>
          ) : results.length === 0 ? (
            <p className="text-center text-2xl text-gray-600">No hay resultados aún.</p>
          ) : (
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  <tr>
                    <th className="p-6 text-left">Nombre</th>
                    <th className="p-6 text-left">Cédula</th>
                    <th className="p-6 text-left">Fecha</th>
                    <th className="p-6 text-center">Correctas</th>
                    <th className="p-6 text-center">Porcentaje</th>
                    <th className="p-6 text-center">Estado</th>
                    <th className="p-6 text-center">Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-6">{r.name}</td>
                      <td className="p-6">{r.idNumber}</td>
                      <td className="p-6">{new Date(r.date).toLocaleString('es-CO')}</td>
                      <td className="p-6 text-center">{r.correct}/{r.total}</td>
                      <td className="p-6 text-center font-bold" style={{ color: r.passed ? '#059669' : '#dc2626' }}>
                        {r.pct}%
                      </td>
                      <td className="p-6 text-center font-bold">
                        {r.passed ? 'APROBADO' : 'NO APROBADO'}
                      </td>
                      <td className="p-6 text-center">{r.timeUsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== EXAMEN (CANDIDATO) ======
  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-12 text-center border-8 border-indigo-200">
          <h1 className="text-4xl font-black text-gray-900 mb-8">Datos del Candidato</h1>
          <input
            type="text"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Nombre completo"
            className="w-full p-4 mb-4 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg"
          />
          <input
            type="text"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            placeholder="Número de cédula"
            className="w-full p-4 mb-8 rounded-xl border-2 border-gray-300 focus:border-indigo-500 outline-none text-lg"
          />
          <button
            onClick={() => {
              if (!candidateName || !candidateId) {
                alert("Por favor ingresa nombre y cédula");
                return;
              }
              setStarted(true);
              setProctoringActive(true);
            }}
            disabled={!candidateName || !candidateId}
            className={`w-full py-6 rounded-2xl font-black text-2xl shadow-2xl transition-all ${
              candidateName && candidateId
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer'
                : 'bg-gray-400 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-10 h-10 mr-4 inline" />
            ¡INICIAR EXAMEN!
          </button>

          {proctoringActive && (
            <div className="mt-6 p-4 bg-emerald-100 border border-emerald-300 rounded-xl text-center">
              <p className="font-semibold text-emerald-900">✅ Proctoring activado - Monitoreo en vivo</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (finished) {
    const score = calculateScore(answers);

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-12 text-center border-8 border-emerald-200">
          <div className={`w-32 h-32 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl ${score.passed ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            {score.passed ? <CheckCircle className="w-20 h-20" /> : <AlertCircle className="w-20 h-20" />}
          </div>
          <h1 className="text-5xl font-black text-gray-900 mb-6">
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
            <div className="mt-6 p-4 bg-white rounded-xl shadow-sm">
              <p className="text-gray-700 font-semibold">
                ⏱️ Tiempo utilizado: <span className="font-black text-indigo-600">{formatTime(3600 - timeLeft)}</span>
              </p>
            </div>
          </div>
          <p className="text-xl text-gray-600 mb-8 max-w-md mx-auto">
            Tus respuestas han sido registradas exitosamente. El equipo de admisiones te contactará pronto.
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

  // ====== EXAMEN EN PROGRESO ======
  const q = questions[currentQ];
  const prog = ((currentQ + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/50">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-red-100 p-3 rounded-xl border-2 border-red-200 shadow-md">
                <Clock className="w-6 h-6 text-red-600 mr-2" />
                <span className="text-2xl font-mono font-bold text-red-700 tracking-wide">{formatTime(timeLeft)}</span>
              </div>
              <div className="bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-xl font-mono font-semibold text-indigo-900 shadow-inner">
                Pregunta {currentQ + 1} de {questions.length}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold text-gray-800 bg-white/60 px-4 py-2 rounded-xl shadow-sm">
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
          <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full shadow-lg transition-all duration-1000"
              style={{ width: `${prog}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-white/50">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Pregunta {currentQ + 1}</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full mb-8"></div>
          <p className="text-xl leading-relaxed text-gray-800 mb-10">{q.question}</p>

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
                  <div
                    className={`w-8 h-8 rounded-2xl border-4 mr-5 flex items-center justify-center font-bold text-sm shadow-md transition-all group-hover:scale-110 ${
                      selected === i
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-300/50'
                        : 'bg-white border-gray-300 text-gray-600 shadow-sm'
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="text-lg leading-relaxed">{opt}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-6 border-t-2 border-gray-100">
            <button
              onClick={handleNext}
              disabled={selected === null}
              className={`px-12 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all transform ${
                selected === null
                  ? 'bg-gray-400 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/50 hover:shadow-indigo-500/75 hover:scale-[1.05] shadow-2xl'
              }`}
            >
              {currentQ < questions.length - 1 ? `Siguiente (${currentQ + 2})` : '🎯 Finalizar Examen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
