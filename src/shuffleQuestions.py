import re
import random

def analyze_and_rebalance(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex mejorada para capturar el bloque completo de la pregunta
    # Captura: id (1), texto (2), contenido de opciones (3) y respuesta correcta (4)
    q_pattern = re.compile(r'\{ id: (\d+), question: "(.*?)", options: \[(.*?)\], correct: (\d+) \}', re.DOTALL)
    matches = list(q_pattern.finditer(content))

    total_q = len(matches)
    print(f"Total de preguntas encontradas: {total_q}")

    # Generar distribución equitativa de objetivos (0, 1, 2, 3)
    target_indices = [0, 1, 2, 3] * (total_q // 4)
    target_indices += list(range(total_q % 4))
    random.shuffle(target_indices)

    parts = []
    last_end = 0
    new_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    errors = 0

    for i, match in enumerate(matches):
        # Añadir el texto que hay entre la pregunta anterior y esta
        parts.append(content[last_end:match.start()])

        q_id = match.group(1)
        q_text = match.group(2)
        options_raw = match.group(3)
        old_correct = int(match.group(4))

        # SOLUCIÓN AL BUG: Extraer opciones buscando texto entre comillas dobles
        # Esto ignora las comas que estén dentro de los textos de las opciones
        options = re.findall(r'"(.*?)"', options_raw)

        # Validación estricta: Solo procesar si hay exactamente 4 opciones
        if len(options) != 4:
            print(f"Error: La pregunta ID {q_id} tiene {len(options)} opciones. Se omite para evitar daños.")
            parts.append(match.group(0))
            last_end = match.end()
            errors += 1
            continue

        new_correct = target_indices[i]

        # Intercambio de valores (Swapping)
        # El texto de la respuesta correcta original se mueve a la nueva posición 'new_correct'
        correct_val = options[old_correct]
        other_val = options[new_correct]
        
        options[new_correct] = correct_val
        options[old_correct] = other_val

        # Reconstrucción del string de opciones
        new_options_str = ", ".join([f'"{opt}"' for opt in options])
        
        # Reconstrucción del objeto de la pregunta
        new_q_str = f'{{ id: {q_id}, question: "{q_text}", options: [{new_options_str}], correct: {new_correct} }}'
        
        parts.append(new_q_str)
        last_end = match.end()
        new_counts[new_correct] += 1

    # Añadir el resto del archivo (cierres de arrays, etc.)
    parts.append(content[last_end:])
    final_content = "".join(parts)

    with open('questions.ts', 'w', encoding='utf-8') as f:
        f.write(final_content)

    print(f"\nProceso finalizado:")
    print(f"- Preguntas procesadas con éxito: {total_q - errors}")
    print(f"- Preguntas con errores (no tocadas): {errors}")
    print(f"- Nueva distribución de respuestas: {new_counts}")

    return total_q, new_counts

# Ejecución
analyze_and_rebalance('questionsog.ts')
