import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createAttemptQuestions,
  getGoogleAiModeUrl,
  OPTION_LETTERS,
} from './examUtils.js';

function isValidQuestion(question) {
  return (
    question !== null &&
    typeof question === 'object' &&
    (typeof question.id === 'number' || typeof question.id === 'string') &&
    typeof question.question === 'string' &&
    (question.passage === undefined || typeof question.passage === 'string') &&
    question.options !== null &&
    typeof question.options === 'object' &&
    OPTION_LETTERS.every((letter) => typeof question.options[letter] === 'string') &&
    OPTION_LETTERS.includes(question.correct_answer) &&
    typeof question.explanation === 'string'
  );
}

function parseExam(data) {
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray(data.sections) ||
    !data.sections.every(
      (section) =>
        section !== null &&
        typeof section === 'object' &&
        typeof section.section_name === 'string' &&
        Array.isArray(section.questions) &&
        section.questions.every(isValidQuestion),
    )
  ) {
    throw new Error(
      'This JSON does not match the exam format. Check sections, section_name, and question fields.',
    );
  }

  return data.sections.map((section, sectionIndex) => ({
    ...section,
    questions: section.questions.map((question, questionIndex) => ({
      ...question,
      key: `${sectionIndex}-${questionIndex}`,
      sectionIndex,
    })),
  }));
}

function getQuestionStatus(question, answer) {
  if (answer === undefined) return 'unanswered';
  return answer === question.correct_answer ? 'correct' : 'incorrect';
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function parseExamCatalog(data) {
  if (
    !Array.isArray(data) ||
    !data.every(
      (exam) =>
        exam !== null &&
        typeof exam === 'object' &&
        typeof exam.file === 'string' &&
        typeof exam.title === 'string' &&
        typeof exam.description === 'string',
    )
  ) {
    throw new Error('The exam library has an invalid format.');
  }

  return data;
}

function App() {
  const [sections, setSections] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [examCatalog, setExamCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [mode, setMode] = useState('practice');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [showAnswersAfterSubmit, setShowAnswersAfterSubmit] = useState(true);
  const [deadline, setDeadline] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [examName, setExamName] = useState('RRB / NIC practice set');
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadExamCatalog() {
      try {
        const response = await fetch('/exams.json');
        if (!response.ok) {
          throw new Error(`Could not load the exam library (${response.status}).`);
        }
        setExamCatalog(parseExamCatalog(await response.json()));
      } catch (catalogError) {
        setError(catalogError.message || 'Could not load the exam library.');
      } finally {
        setLoading(false);
      }
    }

    loadExamCatalog();
  }, []);

  const examQuestions = useMemo(
    () => sections.flatMap((section) => section.questions),
    [sections],
  );
  const activeQuestion = questions[activeQuestionIndex];
  const activeCorrectOption = activeQuestion?.displayOptions.find(
    (option) => option.key === activeQuestion.correct_answer,
  );
  const activeSectionIndex = activeQuestion?.sectionIndex ?? 0;
  const activeSectionQuestionEntries = questions.flatMap((question, index) =>
    question.sectionIndex === activeSectionIndex ? [{ question, index }] : [],
  );
  const activeSectionAnsweredCount = activeSectionQuestionEntries.filter(
    ({ question }) => answers[question.key] !== undefined,
  ).length;
  const answeredCount = Object.keys(answers).length;
  const score = questions.reduce(
    (total, question) => total + Number(answers[question.key] === question.correct_answer),
    0,
  );
  const selectedAnswer = activeQuestion ? answers[activeQuestion.key] : undefined;
  const hasAnswered = selectedAnswer !== undefined;
  const answerIsCorrect = selectedAnswer === activeQuestion?.correct_answer;
  const showPracticeFeedback = mode === 'practice' && hasAnswered;

  function loadExam(data, name) {
    const parsedSections = parseExam(data);
    setSections(parsedSections);
    setQuestions([]);
    setAnswers({});
    setActiveQuestionIndex(0);
    setSubmitted(false);
    setSessionStarted(false);
    setMode('practice');
    setTimerEnabled(false);
    setDurationMinutes(
      Number.isInteger(data.duration_minutes) && data.duration_minutes > 0
        ? data.duration_minutes
        : 60,
    );
    setShowAnswersAfterSubmit(true);
    setDeadline(null);
    setRemainingSeconds(0);
    setError('');
    setExamName(typeof data.test_name === 'string' ? data.test_name : name);
  }

  function startAttempt() {
    const attemptQuestions = createAttemptQuestions(sections);
    const timerDuration = mode === 'test' && timerEnabled ? durationMinutes : 0;

    setQuestions(attemptQuestions);
    setAnswers({});
    setActiveQuestionIndex(0);
    setSubmitted(false);
    setSessionStarted(true);
    setDeadline(timerDuration > 0 ? Date.now() + timerDuration * 60 * 1000 : null);
    setRemainingSeconds(timerDuration * 60);
  }

  async function loadExamFile(exam) {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/${encodeURIComponent(exam.file)}`);
      if (!response.ok) {
        throw new Error(`Could not load ${exam.file} (${response.status}).`);
      }
      loadExam(await response.json(), exam.title);
    } catch (loadError) {
      setError(loadError.message || `Could not load ${exam.file}.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      loadExam(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''));
    } catch (fileError) {
      setError(fileError.message || 'Could not read this JSON file.');
    } finally {
      event.target.value = '';
    }
  }

  function selectSection(sectionIndex) {
    const questionIndex = questions.findIndex(
      (question) => question.sectionIndex === sectionIndex,
    );
    if (questionIndex !== -1) setActiveQuestionIndex(questionIndex);
  }

  function openQuestionSearch(question) {
    const searchWindow = window.open(
      getGoogleAiModeUrl(question),
      'exam-google-ai-mode',
      'popup=yes,width=900,height=720,resizable=yes,scrollbars=yes',
    );

    if (!searchWindow) {
      setError('Your browser blocked the Google AI Mode popup. Allow pop-ups for this site and try again.');
      return;
    }

    searchWindow.opener = null;
    setError('');
  }

  function startOver() {
    startAttempt();
  }

  function returnToLibrary(event) {
    event.preventDefault();
    setSections([]);
    setQuestions([]);
    setAnswers({});
    setActiveQuestionIndex(0);
    setSubmitted(false);
    setSessionStarted(false);
    setDeadline(null);
    setRemainingSeconds(0);
    setError('');
    setExamName('');
  }

  useEffect(() => {
    if (!sessionStarted || mode !== 'test' || !timerEnabled || submitted || deadline === null) {
      return undefined;
    }

    function updateRemainingTime() {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
      if (secondsLeft === 0) setSubmitted(true);
    }

    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [deadline, mode, sessionStarted, submitted, timerEnabled]);

  if (loading) {
    return (
      <main className="loading-screen" aria-live="polite">
        Loading the exam library…
      </main>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="ExamPrep home" onClick={returnToLibrary}>
            <span className="brand-mark">e</span>
            <span>exam<span className="brand-accent">prep</span></span>
          </a>
          <div className="topbar-meta">
            <span className="exam-label">EXAM LIBRARY</span>
            <button className="button button-upload" onClick={() => fileInputRef.current?.click()}>
              <span aria-hidden="true">＋</span> Load JSON
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              aria-label="Choose an exam JSON file"
            />
          </div>
        </header>
        <main className="home-content">
          <div className="home-heading">
            <p className="eyebrow">YOUR NEXT PRACTICE SESSION</p>
            <h1>Choose an exam</h1>
            <p>Pick a mock test to begin, or load your own JSON question paper.</p>
          </div>
          {error && <p className="error-banner" role="alert">{error}</p>}
          {examCatalog.length > 0 ? (
            <div className="exam-grid">
              {examCatalog.map((exam) => (
                <article className="exam-card" key={exam.file}>
                  <div className="exam-card-meta">
                    <span className="exam-card-icon" aria-hidden="true">e</span>
                    <span className="exam-file-name">{exam.file}</span>
                  </div>
                  <h2>{exam.title}</h2>
                  <p>{exam.description}</p>
                  <button className="button button-primary" onClick={() => loadExamFile(exam)}>
                    Start exam <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-library">No exams are listed yet. Load a JSON file to get started.</p>
          )}
        </main>
        <footer className="home-footer">
          <span>Practice makes progress.</span>
          <span>{examCatalog.length} exams available</span>
        </footer>
      </div>
    );
  }

  if (examQuestions.length === 0) {
    return (
      <main className="message-screen">
        <div className="message-card">
          <span className="eyebrow">EXAM PREP</span>
          <h1>This exam has no questions yet</h1>
          <p>Choose another exam or load a different JSON file.</p>
          <button className="button button-primary" onClick={() => fileInputRef.current?.click()}>
            Choose a JSON file
          </button>
          <button className="button button-secondary" onClick={(event) => returnToLibrary(event)}>
            Back to exams
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            aria-label="Choose an exam JSON file"
          />
        </div>
      </main>
    );
  }

  if (!sessionStarted) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="ExamPrep home" onClick={returnToLibrary}>
            <span className="brand-mark">e</span>
            <span>exam<span className="brand-accent">prep</span></span>
          </a>
          <div className="topbar-meta">
            <span className="exam-label">EXAM SETUP</span>
            <button className="button button-upload" onClick={returnToLibrary}>All exams</button>
            <button className="button button-upload" onClick={() => fileInputRef.current?.click()}>
              <span aria-hidden="true">＋</span> Load JSON
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              aria-label="Choose an exam JSON file"
            />
          </div>
        </header>

        <main className="main-content">
          <section className="setup-card" aria-labelledby="setup-title">
            <p className="eyebrow">GET READY</p>
            <h1 id="setup-title">{examName}</h1>
            <p className="subtitle">{examQuestions.length} questions. Choose how you want to practice.</p>

            {error && <p className="error-banner" role="alert">{error}</p>}

            <fieldset className="mode-options">
              <legend>Choose a mode</legend>
              <label className={`mode-option ${mode === 'practice' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="exam-mode"
                  value="practice"
                  checked={mode === 'practice'}
                  onChange={() => setMode('practice')}
                />
                <span>
                  <strong>Practice</strong>
                  <small>See whether your answer is right and review its explanation as you go.</small>
                </span>
              </label>
              <label className={`mode-option ${mode === 'test' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="exam-mode"
                  value="test"
                  checked={mode === 'test'}
                  onChange={() => setMode('test')}
                />
                <span>
                  <strong>Test</strong>
                  <small>Answer questions without seeing correctness feedback during the test.</small>
                </span>
              </label>
            </fieldset>

            {mode === 'test' && (
              <div className="test-settings">
                <label className="setting-option">
                  <input
                    type="checkbox"
                    checked={timerEnabled}
                    onChange={(event) => setTimerEnabled(event.target.checked)}
                  />
                  <span>Use a timer ({durationMinutes} minutes)</span>
                </label>
                <label className="setting-option">
                  <input
                    type="checkbox"
                    checked={showAnswersAfterSubmit}
                    onChange={(event) => setShowAnswersAfterSubmit(event.target.checked)}
                  />
                  <span>Show answers and explanations after submission</span>
                </label>
              </div>
            )}

            <div className="setup-actions">
              <button className="button button-primary" onClick={startAttempt}>
                Start {mode === 'practice' ? 'practice' : 'test'} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ExamPrep home" onClick={returnToLibrary}>
          <span className="brand-mark">e</span>
          <span>exam<span className="brand-accent">prep</span></span>
        </a>
        <div className="topbar-meta">
          <span className="exam-label">{mode.toUpperCase()} MODE</span>
          <button className="button button-upload" onClick={returnToLibrary}>All exams</button>
          <button className="button button-upload" onClick={() => fileInputRef.current?.click()}>
            <span aria-hidden="true">＋</span> Load JSON
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            aria-label="Choose an exam JSON file"
          />
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR PRACTICE SESSION</p>
            <h1>{examName}</h1>
            <p className="subtitle">
              {mode === 'practice'
                ? 'Practice mode · answers and explanations appear as you go.'
                : 'Test mode · answers stay hidden until you submit.'}
            </p>
          </div>
          <div className="question-count-card">
            <span className="count-number">{questions.length}</span>
            <span className="count-label">questions</span>
          </div>
        </div>

        {error && <p className="error-banner" role="alert">{error}</p>}

        {submitted ? (
          <section className="results-card" aria-labelledby="results-title">
            <div className="results-icon" aria-hidden="true">✓</div>
            <p className="eyebrow">SESSION COMPLETE</p>
            <h2 id="results-title">Nice work showing up.</h2>
            <p className="results-score">
              <strong>{score}</strong> <span>of {questions.length} correct</span>
            </p>
            <div
              className="score-track"
              role="progressbar"
              aria-label="Test score"
              aria-valuenow={Math.round((score / questions.length) * 100)}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span style={{ width: `${(score / questions.length) * 100}%` }} />
            </div>
            <p className="results-summary">
              You answered {answeredCount} of {questions.length} questions.
            </p>
            {(mode === 'practice' || showAnswersAfterSubmit) && (
              <div className="review-list">
                {questions.map((question, index) => {
                  const isCorrect = answers[question.key] === question.correct_answer;
                  const correctOption = question.displayOptions.find(
                    (option) => option.key === question.correct_answer,
                  );
                  return (
                    <article className="review-item" key={question.key}>
                      <div className="review-heading">
                        <span className={`review-status ${isCorrect ? 'is-correct' : 'is-incorrect'}`}>
                          {isCorrect ? 'Correct' : 'Review'}
                        </span>
                        <span>Question {index + 1} · {sections[question.sectionIndex].section_name}</span>
                      </div>
                      <h3>{question.question}</h3>
                      <p className="review-answer">
                        Correct answer: <strong>{correctOption.label}. {correctOption.text}</strong>
                      </p>
                      <p className="explanation">{question.explanation}</p>
                    </article>
                  );
                })}
              </div>
            )}
            <button className="button button-primary" onClick={startOver}>Try again</button>
          </section>
        ) : (
          <div className="test-layout">
            <aside className="sidebar" aria-label="Test progress">
              <section className="sidebar-card">
                <div className="sidebar-title">
                  <h2>Sections</h2>
                  <span>{sections.length}</span>
                </div>
                <nav aria-label="Exam sections">
                  <ul className="section-list">
                    {sections.map((section, index) => (
                      <li key={`${section.section_name}-${index}`}>
                        <button
                          className={`section-button ${activeQuestion?.sectionIndex === index ? 'is-active' : ''}`}
                          onClick={() => selectSection(index)}
                          disabled={section.questions.length === 0}
                        >
                          <span className="section-name">{section.section_name}</span>
                          <span className="section-total">{section.questions.length}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </section>

              <section className="sidebar-card question-nav-card">
                <div className="sidebar-title">
                  <h2>Question map</h2>
                  <span>{activeSectionAnsweredCount}/{activeSectionQuestionEntries.length}</span>
                </div>
                <p className="map-hint">{sections[activeSectionIndex].section_name}</p>
                <div
                  className="question-map"
                  role="group"
                  aria-label={`${sections[activeSectionIndex].section_name} questions`}
                >
                  {activeSectionQuestionEntries.map(({ question, index }, sectionQuestionIndex) => {
                    const answer = answers[question.key];
                    const status = mode === 'practice'
                      ? getQuestionStatus(question, answer)
                      : answer === undefined ? 'unanswered' : 'answered';
                    return (
                      <button
                        key={question.key}
                        className={`question-number ${activeQuestionIndex === index ? 'is-current' : ''} ${status !== 'unanswered' ? `is-${status}` : ''}`}
                        onClick={() => setActiveQuestionIndex(index)}
                        aria-label={`${sections[activeSectionIndex].section_name}, question ${sectionQuestionIndex + 1}, ${status}`}
                        aria-current={activeQuestionIndex === index ? 'step' : undefined}
                      >
                        {sectionQuestionIndex + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="map-legend">
                  {mode === 'practice' ? (
                    <>
                      <span><i className="legend-dot correct" /> Correct</span>
                      <span><i className="legend-dot incorrect" /> Incorrect</span>
                    </>
                  ) : (
                    <span><i className="legend-dot answered" /> Answered</span>
                  )}
                  <span><i className="legend-dot unanswered" /> To do</span>
                </div>
              </section>

              <div className="progress-card">
                <div className="progress-copy">
                  <span>YOUR PROGRESS</span>
                  <strong>{Math.round((answeredCount / questions.length) * 100)}%</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
                </div>
                <p>{answeredCount} of {questions.length} answered</p>
              </div>
            </aside>

            <section className="question-card" aria-labelledby="question-title">
              <div className="question-topline">
                <span className="question-index">QUESTION {activeQuestionIndex + 1} <span>/ {questions.length}</span></span>
                <div className="question-actions">
                  {mode === 'test' && timerEnabled && (
                    <span
                      className={`timer-display ${remainingSeconds <= 60 ? 'is-low' : ''}`}
                      role="timer"
                      aria-label={`Time remaining: ${formatTime(remainingSeconds)}`}
                    >
                      {formatTime(remainingSeconds)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="button button-search"
                    onClick={() => openQuestionSearch(activeQuestion)}
                    aria-label="Open this question directly in Google AI Mode"
                  >
                    Ask AI <span aria-hidden="true">↗</span>
                  </button>
                  <span className="section-tag">{sections[activeQuestion.sectionIndex].section_name}</span>
                </div>
              </div>
              {activeQuestion.passage && (
                <section className="passage-panel" aria-labelledby="passage-title">
                  <h3 id="passage-title">Reading passage</h3>
                  <p>{activeQuestion.passage}</p>
                </section>
              )}
              <h2 id="question-title">{activeQuestion.question}</h2>
              <fieldset className="options-list">
                <legend className="visually-hidden">Choose one answer</legend>
                {activeQuestion.displayOptions.map((option) => (
                  <label
                    className={`option-card ${selectedAnswer === option.key ? 'is-selected' : ''} ${showPracticeFeedback && option.key === activeQuestion.correct_answer ? 'is-correct' : ''} ${showPracticeFeedback && selectedAnswer === option.key && !answerIsCorrect ? 'is-incorrect' : ''}`}
                    key={option.key}
                  >
                    <input
                      type="radio"
                      name={`answer-${activeQuestion.key}`}
                      value={option.key}
                      checked={selectedAnswer === option.key}
                      onChange={() =>
                        setAnswers((currentAnswers) => ({
                          ...currentAnswers,
                          [activeQuestion.key]: option.key,
                        }))
                      }
                    />
                    <span className="option-letter">{option.label}</span>
                    <span className="option-text">{option.text}</span>
                    <span className="option-check" aria-hidden="true">
                      {showPracticeFeedback && selectedAnswer === option.key && !answerIsCorrect ? '×' : '✓'}
                    </span>
                  </label>
                ))}
              </fieldset>
              {showPracticeFeedback && (
                <div
                  className={`answer-feedback ${answerIsCorrect ? 'is-correct' : 'is-incorrect'}`}
                  role="status"
                  aria-live="polite"
                >
                  <strong>
                    {answerIsCorrect
                      ? 'Correct!'
                      : `Incorrect. The correct answer is ${activeCorrectOption.label}. ${activeCorrectOption.text}`}
                  </strong>
                  {!answerIsCorrect && <p>{activeQuestion.explanation}</p>}
                </div>
              )}
              <div className="question-footer">
                <button
                  className="button button-secondary"
                  onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
                  disabled={activeQuestionIndex === 0}
                >
                  <span aria-hidden="true">←</span> Previous
                </button>
                <span className="autosave-note"><span aria-hidden="true">●</span> Answers kept for this attempt</span>
                {activeQuestionIndex < questions.length - 1 ? (
                  <button
                    className="button button-primary"
                    onClick={() => setActiveQuestionIndex((index) => Math.min(questions.length - 1, index + 1))}
                  >
                    Next question <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <button className="button button-primary" onClick={() => setSubmitted(true)}>
                    {mode === 'practice' ? 'Finish practice' : 'Submit test'} <span aria-hidden="true">✓</span>
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="page-footer">
          <span>Practice makes progress.</span>
          <span>Built for your next big step <span aria-hidden="true">✦</span></span>
        </footer>
      </main>
    </div>
  );
}

export default App;
