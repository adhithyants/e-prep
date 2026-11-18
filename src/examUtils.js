export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function getGoogleAiModeUrl(question) {
  const options = question.displayOptions
    ?? OPTION_LETTERS.map((key) => ({ label: key, text: question.options[key] }));
  const prompt = [
    'Solve this competitive exam question. Give the correct option and a concise explanation. Use the passage if one is provided.',
    question.passage ? `Passage:\n${question.passage}` : '',
    `Question:\n${question.question}`,
    `Options:\n${options.map((option) => `${option.label}. ${option.text}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('udm', '50');
  url.searchParams.set('q', prompt);

  return url.toString();
}

function shuffle(items, random) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [
      shuffledItems[swapIndex],
      shuffledItems[index],
    ];
  }

  return shuffledItems;
}

export function createAttemptQuestions(sections, random = Math.random) {
  const questions = sections.flatMap((section) => section.questions);

  return shuffle(questions, random).map((question) => ({
    ...question,
    displayOptions: shuffle(OPTION_LETTERS, random).map((optionKey, index) => ({
      key: optionKey,
      label: OPTION_LETTERS[index],
      text: question.options[optionKey],
    })),
  }));
}
