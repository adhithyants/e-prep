import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttemptQuestions, getGoogleAiModeUrl } from './examUtils.js';

const sections = [
  {
    section_name: 'Reasoning',
    questions: [
      {
        key: '0-0',
        question: 'Question one',
        options: { A: 'One A', B: 'One B', C: 'One C', D: 'One D' },
        correct_answer: 'C',
      },
      {
        key: '0-1',
        question: 'Question two',
        options: { A: 'Two A', B: 'Two B', C: 'Two C', D: 'Two D' },
        correct_answer: 'A',
      },
    ],
  },
];

test('shuffles questions and choices while preserving correct-answer identity', () => {
  const attempt = createAttemptQuestions(sections, () => 0);

  assert.deepEqual(attempt.map((question) => question.key), ['0-1', '0-0']);

  for (const question of attempt) {
    assert.deepEqual(
      question.displayOptions.map((option) => option.label),
      ['A', 'B', 'C', 'D'],
    );

    const correctOption = question.displayOptions.find(
      (option) => option.key === question.correct_answer,
    );
    assert.equal(correctOption.text, question.options[question.correct_answer]);
    assert.notEqual(correctOption.label, question.correct_answer);
  }
});

test('does not mutate the source exam data', () => {
  const originalQuestions = sections[0].questions.map((question) => ({
    ...question,
    options: { ...question.options },
  }));

  createAttemptQuestions(sections, () => 0);

  assert.deepEqual(sections[0].questions, originalQuestions);
});

test('builds a direct AI Mode URL using the displayed option labels', () => {
  const question = {
    question: 'What is the answer?',
    passage: 'Read this passage.',
    options: { A: 'First', B: 'Second', C: 'Third', D: 'Fourth' },
    displayOptions: [
      { label: 'A', text: 'Fourth' },
      { label: 'B', text: 'Second' },
      { label: 'C', text: 'First' },
      { label: 'D', text: 'Third' },
    ],
  };
  const url = new URL(getGoogleAiModeUrl(question));

  assert.equal(url.origin + url.pathname, 'https://www.google.com/search');
  assert.equal(url.searchParams.get('udm'), '50');
  assert.match(url.searchParams.get('q'), /Question:\nWhat is the answer\?/);
  assert.match(url.searchParams.get('q'), /A\. Fourth/);
});
