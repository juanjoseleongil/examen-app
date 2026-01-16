import re
import random

def analyze_and_rebalance(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all question arrays
    # Pattern to match: export const questionsXXX = [ ... ];
    # This might be tricky if the arrays are large.
    # Let's find all question objects { id: ..., question: ..., options: [...], correct: ... }
    
    q_pattern = re.compile(r'\{ id: (\d+), question: "(.*?)", options: \[(.*?)\], correct: (\d+) \}', re.DOTALL)
    questions = q_pattern.findall(content)
    
    total_q = len(questions)
    print(f"Total questions found: {total_q}")
    
    correct_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    for q in questions:
        correct_counts[int(q[3])] += 1
    
    print("Current distribution:", correct_counts)
    
    # Target distribution
    target_indices = [0, 1, 2, 3] * (total_q // 4)
    remaining = total_q % 4
    target_indices += list(range(remaining))
    random.shuffle(target_indices)
    
    # We will replace in the content directly to preserve comments and structure
    # However, replacing one by one is safer. 
    # Let's find all occurrences of the question objects.
    
    matches = list(q_pattern.finditer(content))
    new_content = list(content)
    
    # We'll work backwards to not mess up indices, or just build a new string
    # Actually, building a new string with substitutions
    
    offset = 0
    modified_content = content
    
    for i, match in enumerate(matches):
        q_id = match.group(1)
        q_text = match.group(2)
        options_str = match.group(3)
        old_correct = int(match.group(4))
        
        # Parse options
        options = [opt.strip().strip('"') for opt in options_str.split(',')]
        
        correct_option_text = options[old_correct]
        new_correct = target_indices[i]
        
        if new_correct != old_correct:
            # Swap
            options[old_correct], options[new_correct] = options[new_correct], options[old_correct]
        
        # Format new options string
        new_options_str = ", ".join([f'"{opt}"' for opt in options])
        
        new_q_str = f'{{ id: {q_id}, question: "{q_text}", options: [{new_options_str}], correct: {new_correct} }}'
        
        # This approach of replacing by string match might be slow or risky if texts overlap.
        # Safer: use the match indices.
        # But since we are iterating through matches, we need to track the change in length.
    
    # Refined approach:
    parts = []
    last_end = 0
    new_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    
    for i, match in enumerate(matches):
        parts.append(content[last_end:match.start()])
        
        q_id = match.group(1)
        q_text = match.group(2)
        options_str = match.group(3)
        old_correct = int(match.group(4))
        
        options = [opt.strip().strip('"') for opt in options_str.split(',')]
        new_correct = target_indices[i]
        
        # Swap options to make new_correct the right answer
        # The original correct text was at options[old_correct]
        # We want it to be at options[new_correct]
        correct_val = options[old_correct]
        other_val = options[new_correct]
        options[new_correct] = correct_val
        options[old_correct] = other_val
        
        new_options_str = ", ".join([f'"{opt}"' for opt in options])
        new_q_str = f'{{ id: {q_id}, question: "{q_text}", options: [{new_options_str}], correct: {new_correct} }}'
        
        parts.append(new_q_str)
        last_end = match.end()
        new_counts[new_correct] += 1
        
    parts.append(content[last_end:])
    final_content = "".join(parts)
    
    with open('questions_rebalanced.ts', 'w', encoding='utf-8') as f:
        f.write(final_content)
        
    return total_q, correct_counts, new_counts

total, old_dist, new_dist = analyze_and_rebalance('questions.ts')
print(f"Processed {total} questions.")
print(f"Old distribution: {old_dist}")
print(f"New distribution: {new_dist}")
