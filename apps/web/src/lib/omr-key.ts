/** Accept compact letters or a complete, sequential numbered list; never discard unknown input. */
export function parseAnswerKey(text: string, choiceCount: number): string[] {
  const value = text.trim().toUpperCase();
  let answers: string[];
  if (/^[A-E\s,;|]+$/.test(value)) {
    answers = value.replace(/[\s,;|]/g, '').split('');
  } else {
    const matches = [...value.matchAll(/(\d+)\s*[).:\-]\s*([A-E])/g)];
    if (!matches.length || value.replace(/(\d+)\s*[).:\-]\s*([A-E])/g, '').replace(/[\s,;|]/g, '') ||
        matches.some((match, index) => Number(match[1]) !== index + 1))
      throw new Error('Cavabları ABCD və ya 1:A 2:B 3:C şəklində, ardıcıl daxil edin.');
    answers = matches.map(match => match[2]);
  }
  if (!answers.length || answers.length > 150)
    throw new Error('1–150 cavab daxil edin.');
  if (answers.some(answer => 'ABCDE'.indexOf(answer) >= choiceCount))
    throw new Error('Cavablardan biri seçilmiş variant sayına uyğun deyil.');
  return answers;
}
