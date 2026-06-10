/*
  Jogo Visual atualizado.
  Alterações documentadas:
  - A lógica mecânica original do p5.js foi preservada: estímulos, movimento, atalhos,
    níveis, vidas, sons, feedback, divisões e controlos continuam no mesmo fluxo.
  - Foram adicionadas camadas externas de persistência, sincronização, dashboard,
    histórico e exportação sem substituir a lógica do jogo.
  - Estado inicial corrigido: formas geométricas visíveis e paradas; números não aparecem
    antes do início; o jogo só começa por ação do utilizador.
*/

// ===== Configuração de base de dados / Google Sheets =====
const APP_NAME = 'Jogo Visual';
const DB_NAME = 'Jogo Visual';
const DB_VERSION = 1;
const STORE_NAME = 'attemptRecords';
const ACTIVE_ATTEMPT_KEY = 'jogoVisual.activeAttempt.v1';
const API_URL_KEY = 'jogoVisual.appsScriptUrl.v1';
const SESSION_COUNTER_KEY = 'jogoVisual.sessionCounter.v1';

const SHEET_HEADERS = [
  'Data', 'Hora', 'ID único da sessão', 'ID único da tentativa', 'Número da sessão',
  'Número da tentativa', 'Duração da sessão', 'Duração da tentativa', 'Nível inicial',
  'Nível final', 'Nível máximo atingido', 'Pontuação final', 'Melhor sequência',
  'Número total de tentativas', 'Respostas corretas', 'Respostas incorretas',
  'Percentagem de acerto', 'Tempo médio de resposta', 'Melhor tempo de resposta',
  'Pior tempo de resposta', 'Quadrante com mais erros', 'Quadrante com menos erros',
  'Dificuldade ou velocidade atual', 'Configurações relevantes usadas',
  'Autoavaliação do utilizador, de 0 a 10', 'Observações escritas pelo utilizador',
  'Observações automáticas geradas pela aplicação', 'Última pergunta apresentada',
  'Última resposta dada', 'Última observação apresentada pela aplicação',
  'Estado de sincronização', 'Data/hora da sincronização'
];

function configuredApiUrl() {
  return (localStorage.getItem(API_URL_KEY) || window.VisualTrainingConfig?.apiUrl || '').trim();
}

// ===== Código original preservado — variáveis do jogo =====
let stimuli = ['1', '2', '3', '4'];
let trials = [];
let currentStimulus = '';
let stimulusX = 0, stimulusY = 0;
let stimulusShown = false;
let stimulusStartTime = 0;
let stimulusDuration = 3000;
let score = 0;
let total = 0;
let testFinished = false;
let feedbackStartTime = 0;
let showingFeedback = false;
let feedbackDuration = 200;
let started = false;
let oscCorrect, oscWrong, oscLevelUp, oscGameOver, oscExtraLife;
let leftTrials = 0, rightTrials = 0;
let leftCorrect = 0, rightCorrect = 0;
let stimulusShownSide = '';
let trialData = [];
let exportButton;
let textSizeStimulus = 64;
let shapeSize = 60;
let feedbackShape = null;
let feedbackColor = null;
let roundCount = 0;
let divisionLevel = 0;
// Alteração mínima de estado inicial: movimento começa desligado; lógica do movimento abaixo não foi reescrita.
let movementEnabled = false;
let moveToCenter = false;
// Alteração mínima de estado inicial: formas visíveis por defeito para evitar números no estado inicial.
let showShapes = true;
let stimulusVX = 0;
let stimulusVY = 0;
let correctStreak = 0;
let level = 1;
let showLevelUp = false;
let levelUpTime = 0;
let consecutiveErrors = 0;
let timePaused = false;
let timeLimited = true;
let lives = 5;
let currentStyle = 'default';
let errorPositions = [];

let FIX_X = 0, FIX_Y = 0;
const NEAR_RADIUS = 140;

// ===== Estado longitudinal acrescentado =====
let sessionId = createId('sess');
let sessionNumber = nextSessionNumber();
let attemptNumber = 0;
let sessionStartedAt = null;
let attemptStartedAt = null;
let attemptId = null;
let attemptInitialLevel = 1;
let maxLevelReached = 1;
let bestSequence = 0;
let attemptStartTrialIndex = 0;
let attemptStartTotal = 0;
let attemptStartScore = 0;
let finalizationPending = false;
let finalRecordBeingSaved = null;
let lastQuestionPresented = '';
let lastAnswerGiven = '';
let lastAppObservation = '';
let recoveredInterruptedAttempt = null;
let suppressInitialMKeyToggle = false;

// ===== Inicialização p5 =====
function setup() {
  // Canvas principal do jogo fica no <body>, atrás dos painéis HTML.
  // Isto preserva o desenho p5 original e evita que o canvas cubra Dashboard/Histórico.
  const gameCanvas = createCanvas(windowWidth, windowHeight);
  if (gameCanvas?.parent) gameCanvas.parent(document.body);
  FIX_X = width / 2;
  FIX_Y = height / 2;

  textAlign(CENTER, CENTER);
  textFont('Georgia');

  oscCorrect = new p5.Oscillator('sine');    oscCorrect.freq(660);  oscCorrect.amp(0); oscCorrect.start();
  oscWrong = new p5.Oscillator('sine');      oscWrong.freq(220);    oscWrong.amp(0);   oscWrong.start();
  oscLevelUp = new p5.Oscillator('square');  oscLevelUp.freq(880);  oscLevelUp.amp(0); oscLevelUp.start();
  oscGameOver = new p5.Oscillator('triangle'); oscGameOver.freq(120); oscGameOver.amp(0); oscGameOver.start();
  oscExtraLife = new p5.Oscillator('square');  oscExtraLife.amp(0);  oscExtraLife.start();

  generateTrials();
  noCursor();
  setupUi();
  initStorage().then(async () => {
    recoveredInterruptedAttempt = readActiveAttempt();
    await syncPendingRecords();
    await refreshCurrentPanel();
    updateSyncBadge();
  });
}

function draw() {
  if (!started) { drawStartScreen(); return; }
  if (testFinished) {
    showResults();
    if (!finalizationPending && !finalRecordBeingSaved) promptForAttemptFinalization();
    return;
  }

  switch (currentStyle) {
    case 'retro': background(0); break;
    case 'minimal': background(255); break;
    default:
      colorMode(HSB, 360, 100, 100);
      let hue = (level * 60) % 360;
      background(hue, 50, 95);
      colorMode(RGB, 255);
  }

  drawFixationPoint();
  drawDivisions();
  drawHearts();

  if (showLevelUp && millis() - levelUpTime < 1000) {
    fill(50, 200, 180); textSize(80); text(`Nível ${level}`, width / 2, height / 2);
    drawStatusDisplay(); return;
  } else {
    showLevelUp = false;
  }

  if (timePaused) {
    fill(50); textSize(32); text('Pausado', width / 2, 50);
    drawStatusDisplay(); return;
  }

  if (showingFeedback) {
    drawFeedbackShape();
    if (millis() - feedbackStartTime > feedbackDuration) {
      showingFeedback = false;
      nextStimulus();
    }
    drawStatusDisplay(); return;
  }

  if (stimulusShown) {
    if (timeLimited && millis() - stimulusStartTime > stimulusDuration) {
      total++; recordResponse(false, 'sem resposta'); giveFeedback(false, 'Tempo esgotado');
    } else {
      if (movementEnabled) {
        if (moveToCenter) {
          let dx = FIX_X - stimulusX;
          let dy = FIX_Y - stimulusY;
          let dist = sqrt(dx * dx + dy * dy);
          let speed = 1 + level * 0.1;
          if (dist > 1) {
            stimulusVX = (dx / dist) * speed;
            stimulusVY = (dy / dist) * speed;
          }
        }
        stimulusX += stimulusVX;
        stimulusY += stimulusVY;
        if (!moveToCenter) {
          if (stimulusX < 50 || stimulusX > width - 50) stimulusVX *= -1;
          if (stimulusY < 50 || stimulusY > height - 50) stimulusVY *= -1;
        }
      }
      let sizeReduction = (level - 1) * 5;
      let currentTextSize = max(20, textSizeStimulus - sizeReduction);
      let currentShapeSize = max(20, shapeSize - sizeReduction);
      drawStimulus(currentStimulus, stimulusX, stimulusY, currentTextSize, currentShapeSize);
    }
  }

  drawStatusDisplay();
}

function drawStimulus(stim, x, y, txtSize, shpSize) {
  noStroke();
  if (currentStyle === 'retro') { fill('#0ff'); stroke('#f0f'); strokeWeight(2); }
  else if (currentStyle === 'minimal') { fill(30); noStroke(); }
  else fill('#333');

  if (showShapes) {
    let s = shpSize;
    if (stim === '1') { rectMode(CENTER); rect(x, y, s, s); }
    else if (stim === '2') ellipse(x, y, s, s);
    else if (stim === '3') triangle(x, y - s / 2, x - s / 2, y + s / 2, x + s / 2, y + s / 2);
    else if (stim === '4') drawPentagon(x, y, s / 2);
  } else {
    textSize(txtSize);
    textFont(currentStyle === 'retro' ? 'Courier New' : 'Georgia');
    text(stim, x, y);
  }
}

function drawPentagon(x, y, radius) {
  beginShape();
  for (let i = 0; i < 5; i++) {
    let angle = TWO_PI * i / 5 - PI / 2;
    vertex(x + cos(angle) * radius, y + sin(angle) * radius);
  }
  endShape(CLOSE);
}

function keyPressed() {
  // Estado inicial corrigido: antes de começar, a tecla M também inicia o movimento/jogo.
  // Depois de iniciado, o comportamento original de M continua igual: alterna o movimento.
  if (!started) {
    if (key === 'm' || key === 'M') startGameFromUserGesture();
    return;
  }
  if (!document.getElementById('ratingModal')?.classList.contains('hidden')) return;

  if (testFinished && key === ' ') {
    if (exportButton) exportButton.remove();
    restartTest();
  }

  if (key === 't') timeLimited = !timeLimited;
  if (key === '+') { textSizeStimulus += 5; shapeSize += 5; }
  if (key === '-') { textSizeStimulus = max(10, textSizeStimulus - 5); shapeSize = max(10, shapeSize - 5); }
  if (key === 'f') showShapes = !showShapes;
  if (key === 'm') {
    if (suppressInitialMKeyToggle) suppressInitialMKeyToggle = false;
    else movementEnabled = !movementEnabled;
  }
  if (key === 'q') divisionLevel = (divisionLevel + 1) % 4;
  if (key === 'd') {
    if (currentStyle === 'default') currentStyle = 'retro';
    else if (currentStyle === 'retro') currentStyle = 'minimal';
    else currentStyle = 'default';
  }
  if (key === 'c') moveToCenter = !moveToCenter;

  persistActiveAttempt();

  if (!stimulusShown || testFinished) return;

  if (keyCode === LEFT_ARROW)  stimulusX -= 10;
  if (keyCode === RIGHT_ARROW) stimulusX += 10;
  if (keyCode === UP_ARROW)    stimulusY -= 10;
  if (keyCode === DOWN_ARROW)  stimulusY += 10;

  if (stimuli.includes(key)) {
    let correct = key === currentStimulus;
    if (correct) score++;
    total++;
    recordResponse(correct, key);
    giveFeedback(correct, correct ? 'Resposta correta' : 'Resposta incorreta');
  }
}

function giveFeedback(correct, observationText) {
  stimulusShown = false;
  feedbackStartTime = millis();
  showingFeedback = true;

  feedbackColor = correct ? color(100, 220, 180) : color(240, 80, 80);
  feedbackShape = random(['circle', 'square', 'triangle']);

  lastAppObservation = observationText || (correct ? 'Resposta correta' : 'Resposta incorreta');
  persistActiveAttempt();

  if (correct) {
    consecutiveErrors = 0;
    if (stimulusShownSide === 'left') {
      correctStreak++;
      bestSequence = Math.max(bestSequence, correctStreak);
      if (correctStreak % 4 === 0) { lives++; playExtraLifeSound(); }
      if (correctStreak % 5 === 0) {
        level++; maxLevelReached = Math.max(maxLevelReached, level); showLevelUp = true; levelUpTime = millis();
        oscLevelUp.amp(0.3, 0.05); oscLevelUp.amp(0, 0.3);
      }
    }
    oscCorrect.amp(0.2, 0.05); oscCorrect.amp(0, 0.2);
  } else {
    if (stimulusShownSide === 'left') correctStreak = 0;
    consecutiveErrors++; lives--;
    if (lives <= 0) { finishGameplayNow(); playGameOverSound(); }
    oscWrong.amp(0.15, 0.05); oscWrong.amp(0, 0.2);
  }
}

function finishGameplayNow() {
  // Alteração necessária para robustez: no fim, parar completamente o jogo/movimento antes do painel final.
  testFinished = true;
  stimulusShown = false;
  showingFeedback = false;
  stimulusVX = 0;
  stimulusVY = 0;
  persistActiveAttempt();
}

function playGameOverSound() {
  oscGameOver.freq(140); oscGameOver.amp(0.4, 0.1);
  oscGameOver.freq(90, 0.3);  oscGameOver.amp(0, 0.8);
}

function playExtraLifeSound() {
  const notes = [
    { freq: 1319, duration: 100 }, { freq: 1568, duration: 100 },
    { freq: 1760, duration: 100 }, { freq: 2637, duration: 150 }
  ];
  notes.forEach((note, index) => {
    setTimeout(() => {
      oscExtraLife.freq(note.freq);
      oscExtraLife.amp(0.3, 0.05);
      oscExtraLife.amp(0, 0.2);
    }, index * 100);
  });
}

function drawFeedbackShape() {
  fill(feedbackColor); noStroke();
  let x = 50, y = 50, s = 30;
  if (feedbackShape === 'circle') ellipse(x, y, s, s);
  else if (feedbackShape === 'square') rect(x - s / 2, y - s / 2, s, s, 5);
  else if (feedbackShape === 'triangle') triangle(x, y - s / 2, x - s / 2, y + s / 2, x + s / 2, y + s / 2);
}

function recordResponse(correct, answerValue) {
  let responseTime = millis() - stimulusStartTime;
  let timestamp = new Date().toISOString();
  trialData.push({ stimulus: currentStimulus, side: stimulusShownSide, correct, responseTime, timestamp, x: stimulusX, y: stimulusY, answer: answerValue });
  if (!correct) errorPositions.push({ stim: currentStimulus, x: stimulusX, y: stimulusY });

  lastQuestionPresented = currentStimulus;
  lastAnswerGiven = String(answerValue ?? '');
  // Requisito crítico: guardar imediatamente última pergunta/resposta antes do fim da tentativa.
  persistActiveAttempt();

  if (stimulusShownSide === 'left') {
    if (correct) leftCorrect++;
  } else {
    if (correct) rightCorrect++;
  }
}

function generateTrials() {
  trials = [];
  for (let i = 0; i < 2000; i++) trials.push('tick');
}

function nextStimulus() {
  if (trials.length === 0) { finishGameplayNow(); return; }
  trials.pop();

  let side = 'left';
  stimulusShownSide = side;
  leftTrials++;

  const margin = 20;
  let placed = false;
  for (let i = 0; i < 50 && !placed; i++) {
    let theta = random(PI, 1.5 * PI);
    let r = random(20, NEAR_RADIUS);
    let x = FIX_X + r * cos(theta);
    let y = FIX_Y + r * sin(theta);

    if (x > margin && y > margin && x < FIX_X - margin && y < FIX_Y - margin) {
      stimulusX = x;
      stimulusY = y;
      placed = true;
    }
  }

  if (!placed) {
    stimulusX = constrain(FIX_X - NEAR_RADIUS, margin, width - margin);
    stimulusY = constrain(FIX_Y - NEAR_RADIUS, margin, height - margin);
  }

  stimulusVX = random(-2, 2);
  stimulusVY = random(-2, 2);
  currentStimulus = random(stimuli);
  stimulusShown = true;
  stimulusStartTime = millis();
  lastQuestionPresented = currentStimulus;
  // Requisito crítico: guardar imediatamente a pergunta apresentada.
  persistActiveAttempt();
}

function startTest() {
  started = true;
  // Ao iniciar por botão, clique ou M, o movimento fica ativo; a tecla M preserva depois a função original de alternar.
  movementEnabled = true;
  document.body.classList.add('playing');
  testFinished = false;
  roundCount = 1;
  level = 1;
  correctStreak = 0;
  consecutiveErrors = 0;
  lives = 5;
  errorPositions = [];
  beginAttemptBookkeeping();
  generateTrials();
  nextStimulus();
}

function restartTest() {
  testFinished = false;
  finalizationPending = false;
  finalRecordBeingSaved = null;
  document.getElementById('resultsPanel')?.classList.add('hidden');
  document.body.classList.add('playing');
  movementEnabled = true;
  roundCount++;
  level = 1;
  correctStreak = 0;
  consecutiveErrors = 0;
  lives = 5;
  errorPositions = [];
  beginAttemptBookkeeping();
  generateTrials();
  nextStimulus();
}

function beginAttemptBookkeeping() {
  if (!sessionStartedAt) sessionStartedAt = new Date();
  attemptNumber++;
  attemptId = createId('att');
  attemptStartedAt = new Date();
  attemptInitialLevel = level;
  maxLevelReached = level;
  bestSequence = 0;
  attemptStartTrialIndex = trialData.length;
  attemptStartTotal = total;
  attemptStartScore = score;
  lastQuestionPresented = '';
  lastAnswerGiven = '';
  lastAppObservation = 'Tentativa iniciada';
  persistActiveAttempt();
}

function drawFixationPoint() {
  if (currentStyle === 'minimal') fill(100);
  else if (currentStyle === 'retro') fill('#f0f');
  else fill(70);
  ellipse(FIX_X, FIX_Y, 10, 10);
}

function drawDivisions() {
  stroke(180); strokeWeight(1);
  let divisions = [0, 2, 4, 8][divisionLevel];
  line(FIX_X, 0, FIX_X, height);
  line(0, FIX_Y, width, FIX_Y);
  if (divisions === 0) return;
  let stepX = width / divisions;
  let stepY = height / divisions;
  for (let i = 1; i < divisions; i++) {
    line(FIX_X + i * stepX, 0, FIX_X + i * stepX, height);
    line(FIX_X - i * stepX, 0, FIX_X - i * stepX, height);
    line(0, FIX_Y + i * stepY, width, FIX_Y + i * stepY);
    line(0, FIX_Y - i * stepY, width, FIX_Y - i * stepY);
  }
}

function drawStartScreen() {
  background('#1c1c1c');
  drawFixationPoint();
  drawDivisions();
  // Estado inicial corrigido: quatro formas geométricas visíveis e paradas, sem números.
  push();
  showShapes = true;
  fill('#f8fafc'); noStroke();
  drawStimulus('1', width / 2 - 95, height / 2 - 25, textSizeStimulus, 48);
  drawStimulus('2', width / 2 - 30, height / 2 - 25, textSizeStimulus, 48);
  drawStimulus('3', width / 2 + 35, height / 2 - 25, textSizeStimulus, 48);
  drawStimulus('4', width / 2 + 100, height / 2 - 25, textSizeStimulus, 48);
  fill('#ffffff'); textSize(28);
  text('Formas paradas — carregar em Jogar ou M para iniciar', width / 2, height / 2 + 70);
  textSize(16);
  text('Atalhos preservados: M movimento, F formas/números, T tempo, Q divisões, D estilo, C centro', width / 2, height / 2 + 112);
  pop();
}

function drawStatusDisplay() {
  push();
  textSize(14); fill(80); noStroke(); textAlign(RIGHT, BOTTOM);
  const fonteAtual = max(20, textSizeStimulus - (level - 1) * 5);
  text(`Fonte: ${fonteAtual} | Movimento: ${movementEnabled ? 'Sim' : 'Não'} | Centro: ${moveToCenter ? 'Sim' : 'Não'} | Formas: ${showShapes ? 'Sim' : 'Não'} | Ronda: ${roundCount}`, width - 10, height - 10);

  textAlign(RIGHT, TOP); fill(30); textSize(18);
  text(`Nível: ${level} | ${timeLimited ? 'Com tempo' : 'Sem tempo'} | Estilo: ${currentStyle}`, width - 20, 64);

  textAlign(CENTER, BOTTOM);
  fill(20);
  const sx = stimulusShown ? int(stimulusX) : '-';
  const sy = stimulusShown ? int(stimulusY) : '-';
  text(`Evento: (${sx}, ${sy})  |  Mira: (${int(FIX_X)}, ${int(FIX_Y)})`, width / 2, height - 30);
  pop();
}

function drawHearts() {
  for (let i = 0; i < lives; i++) drawHeart(20 + i * 35, 80, 20);
}

function drawHeart(x, y, size) {
  fill('#e74c3c');
  beginShape();
  vertex(x, y);
  bezierVertex(x - size / 2, y - size / 2, x - size, y + size / 3, x, y + size);
  bezierVertex(x + size, y + size / 3, x + size / 2, y - size / 2, x, y);
  endShape(CLOSE);
}

function showResults() {
  background('#eaf2f2'); fill('#333'); textSize(28);
  let totalCorrect = trialData.filter(d => d.correct).length;
  let percent = total > 0 ? int((totalCorrect / total) * 100) : 0;
  let leftPercent = leftTrials > 0 ? int((leftCorrect / leftTrials) * 100) : 0;
  let rightPercent = rightTrials > 0 ? int((rightCorrect / rightTrials) * 100) : 0;

  text(`Acertos totais: ${totalCorrect}/${total} (${percent}%)`, width / 2, 105);
  textSize(20);
  text(`Lado Esquerdo: ${leftCorrect}/${leftTrials} (${leftPercent}%)`, width / 2, 145);
  text(`Lado Direito: ${rightCorrect}/${rightTrials} (${rightPercent}%)`, width / 2, 175);
  text('Complete a autoavaliação para guardar. Depois pressione [ESPAÇO] para nova ronda.', width / 2, 225);

  errorPositions.forEach((e, i) => {
    push();
    fill(color(`hsl(${(i * 40) % 360} 100% 40%)`));
    textSize(24);
    text(e.stim, e.x + (i % 5), e.y + (i % 5));
    pop();
  });

  drawDivisions();
  drawStatusDisplay();
}

function mousePressed() {
  if (!started) startGameFromUserGesture();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  FIX_X = width / 2;
  FIX_Y = height / 2;
}

// ===== UI e navegação acrescentadas =====
function setupUi() {
  document.getElementById('playBtn').addEventListener('click', startGameFromUserGesture);
  document.getElementById('dashboardBtn').addEventListener('click', () => showDashboard());
  document.getElementById('historyBtn').addEventListener('click', () => showHistory());
  document.getElementById('openDbBtn').addEventListener('click', () => openDatabaseSheet());
  document.getElementById('exportDataBtn').addEventListener('click', () => document.getElementById('exportModal').classList.remove('hidden'));
  document.getElementById('closeExportBtn').addEventListener('click', () => document.getElementById('exportModal').classList.add('hidden'));
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportData('csv'));
  document.getElementById('exportXlsBtn').addEventListener('click', () => exportData('xls'));
  document.getElementById('exportPdfBtn').addEventListener('click', () => exportData('pdf'));
  document.getElementById('ratingForm').addEventListener('submit', handleRatingSubmit);
  window.addEventListener('keydown', event => {
    // Suporte robusto fora do canvas: M também inicia a app no estado inicial.
    // Se o evento chegar também ao keyPressed do p5, evita que esse mesmo M desligue logo o movimento.
    if (!started && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressInitialMKeyToggle = true;
      startGameFromUserGesture();
      setTimeout(() => { suppressInitialMKeyToggle = false; }, 100);
    }
  }, true);
  window.addEventListener('online', () => syncPendingRecords().then(refreshCurrentPanel));
  window.addEventListener('beforeunload', persistActiveAttempt);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service Worker não registado', err));
  }

  window.__JOGO_VISUAL_DEBUG__ = {
    getState: () => ({ started, movementEnabled, showShapes, testFinished, currentStimulus, attemptId }),
    forceFinish: () => finishGameplayNow(),
    getRecords,
    syncPendingRecords,
    recordForGoogleSheets
  };
}

function startGameFromUserGesture() {
  fullscreen(true);
  resizeCanvas(windowWidth, windowHeight);
  FIX_X = width / 2;
  FIX_Y = height / 2;
  userStartAudio();
  // O botão de início põe o jogo em movimento; a lógica original do movimento continua a ser a mesma.
  movementEnabled = true;
  if (!started) startTest(); else if (testFinished && !finalizationPending) restartTest();
}

async function refreshCurrentPanel() {
  if (!document.getElementById('dashboardPanel').classList.contains('hidden')) await showDashboard();
  if (!document.getElementById('historyPanel').classList.contains('hidden')) await showHistory();
  if (!document.getElementById('resultsPanel').classList.contains('hidden')) await renderResultsPanel();
}

function hidePanels() {
  document.getElementById('resultsPanel').classList.add('hidden');
  document.getElementById('dashboardPanel').classList.add('hidden');
  document.getElementById('historyPanel').classList.add('hidden');
}

// ===== Finalização obrigatória com autoavaliação =====
function promptForAttemptFinalization() {
  finalizationPending = true;
  document.body.classList.remove('playing');
  const modal = document.getElementById('ratingModal');
  document.getElementById('ratingInput').value = '';
  document.getElementById('notesInput').value = '';
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('ratingInput').focus(), 50);
}

async function handleRatingSubmit(event) {
  event.preventDefault();
  const rating = Number(document.getElementById('ratingInput').value);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
    alert('A autoavaliação deve ser um número inteiro de 0 a 10.');
    return;
  }
  const notes = document.getElementById('notesInput').value.trim();
  document.getElementById('ratingModal').classList.add('hidden');
  finalRecordBeingSaved = buildAttemptRecord(rating, notes);
  finalRecordBeingSaved['Estado de sincronização'] = navigator.onLine && configuredApiUrl() ? 'pending_sync' : 'local_only';
  finalRecordBeingSaved.syncStatus = finalRecordBeingSaved['Estado de sincronização'];
  await saveRecord(finalRecordBeingSaved);
  clearActiveAttempt();
  finalizationPending = false;
  await renderResultsPanel();
  await syncPendingRecords();
  await renderResultsPanel();
  await showDashboard(false);
}

function buildAttemptRecord(rating, notes) {
  const now = new Date();
  const attemptTrials = trialData.slice(attemptStartTrialIndex);
  const correct = attemptTrials.filter(t => t.correct).length;
  const incorrect = attemptTrials.length - correct;
  const responseTimes = attemptTrials.map(t => Number(t.responseTime)).filter(Number.isFinite);
  const avgRt = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
  const bestRt = responseTimes.length ? Math.min(...responseTimes) : 0;
  const worstRt = responseTimes.length ? Math.max(...responseTimes) : 0;
  const quadrants = quadrantStats(attemptTrials.filter(t => !t.correct));
  const durationAttempt = attemptStartedAt ? now - attemptStartedAt : 0;
  const durationSession = sessionStartedAt ? now - sessionStartedAt : durationAttempt;
  const finalScore = score - attemptStartScore;
  const pct = attemptTrials.length ? Math.round((correct / attemptTrials.length) * 100) : 0;
  const automaticNotes = buildAutomaticObservation(finalScore, pct, maxLevelReached, avgRt);
  const record = {
    attemptId,
    sessionId,
    createdAt: now.toISOString(),
    syncStatus: 'pending_sync',
    'Data': now.toLocaleDateString('pt-PT'),
    'Hora': now.toLocaleTimeString('pt-PT'),
    'ID único da sessão': sessionId,
    'ID único da tentativa': attemptId,
    'Número da sessão': sessionNumber,
    'Número da tentativa': attemptNumber,
    'Duração da sessão': formatDuration(durationSession),
    'Duração da tentativa': formatDuration(durationAttempt),
    'Nível inicial': attemptInitialLevel,
    'Nível final': level,
    'Nível máximo atingido': maxLevelReached,
    'Pontuação final': finalScore,
    'Melhor sequência': bestSequence,
    'Número total de tentativas': attemptTrials.length,
    'Respostas corretas': correct,
    'Respostas incorretas': incorrect,
    'Percentagem de acerto': pct,
    'Tempo médio de resposta': avgRt,
    'Melhor tempo de resposta': bestRt,
    'Pior tempo de resposta': worstRt,
    'Quadrante com mais erros': quadrants.more,
    'Quadrante com menos erros': quadrants.less,
    'Dificuldade ou velocidade atual': `nível=${level}; duração=${stimulusDuration}ms; movimento=${movementEnabled ? 'sim' : 'não'}`,
    'Configurações relevantes usadas': JSON.stringify({ timeLimited, movementEnabled, moveToCenter, showShapes, divisionLevel, currentStyle, textSizeStimulus, shapeSize }),
    'Autoavaliação do utilizador, de 0 a 10': rating,
    'Observações escritas pelo utilizador': notes,
    'Observações automáticas geradas pela aplicação': automaticNotes,
    'Última pergunta apresentada': lastQuestionPresented,
    'Última resposta dada': lastAnswerGiven,
    'Última observação apresentada pela aplicação': lastAppObservation,
    'Estado de sincronização': 'pending_sync',
    'Data/hora da sincronização': ''
  };
  return record;
}

function buildAutomaticObservation(finalScore, pct, maxLvl, avgRt) {
  const trend = pct >= 80 ? 'acerto elevado' : pct >= 50 ? 'acerto intermédio' : 'acerto baixo';
  return `Tentativa concluída com ${trend}; pontuação ${finalScore}; nível máximo ${maxLvl}; tempo médio ${avgRt} ms.`;
}

// ===== Persistência local IndexedDB =====
let dbPromise;
function initStorage() {
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'attemptId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function saveRecord(record) {
  const db = await dbPromise;
  await txDone(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
  updateSyncBadge();
}

async function getRecords() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
    req.onerror = () => reject(req.error);
  });
}

function txDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function persistActiveAttempt() {
  if (!attemptId) return;
  const snapshot = {
    savedAt: new Date().toISOString(), sessionId, attemptId, sessionNumber, attemptNumber,
    started, testFinished, attemptStartedAt: attemptStartedAt?.toISOString(),
    lastQuestionPresented, lastAnswerGiven, lastAppObservation,
    score, total, level, maxLevelReached, bestSequence,
    trialData: trialData.slice(attemptStartTrialIndex),
    settings: { timeLimited, movementEnabled, moveToCenter, showShapes, divisionLevel, currentStyle }
  };
  try { localStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify(snapshot)); } catch (err) { console.warn('Não foi possível guardar snapshot ativo', err); }
}

function readActiveAttempt() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_ATTEMPT_KEY) || 'null'); } catch { return null; }
}
function clearActiveAttempt() { localStorage.removeItem(ACTIVE_ATTEMPT_KEY); }

// ===== Sincronização Google Sheets via Apps Script JSONP =====
async function syncPendingRecords() {
  const apiUrl = configuredApiUrl();
  if (!apiUrl) { updateSyncBadge('pending', 'Google Sheets por configurar'); return { ok: false, reason: 'no_api_url' }; }
  if (!navigator.onLine) { updateSyncBadge('pending', 'Offline — pendente'); return { ok: false, reason: 'offline' }; }
  const records = await getRecords();
  const pending = records.filter(r => ['local_only', 'pending_sync', 'sync_error'].includes(r.syncStatus || r['Estado de sincronização']));
  let okCount = 0;
  for (const record of pending) {
    try {
      const payload = base64UrlEncode(JSON.stringify(recordForGoogleSheets(record)));
      const response = await jsonp(apiUrl, { action: 'sync', payload });
      if (!response || response.ok === false) throw new Error(response?.error || 'Resposta inválida');
      record.syncStatus = 'synced';
      record['Estado de sincronização'] = 'synced';
      record['Data/hora da sincronização'] = new Date().toISOString();
      record.sheetUrl = response.spreadsheetUrl || record.sheetUrl || '';
      await saveRecord(record);
      okCount++;
    } catch (err) {
      record.syncStatus = 'sync_error';
      record['Estado de sincronização'] = 'sync_error';
      record['Data/hora da sincronização'] = new Date().toISOString();
      record.lastSyncError = String(err.message || err);
      await saveRecord(record);
    }
  }
  await pullRemoteRecords();
  updateSyncBadge();
  return { ok: true, synced: okCount, pending: pending.length - okCount };
}

async function pullRemoteRecords() {
  const apiUrl = configuredApiUrl();
  if (!apiUrl || !navigator.onLine) return { ok: false, reason: 'not_configured_or_offline' };
  try {
    const response = await jsonp(apiUrl, { action: 'list' });
    if (!response?.ok || !Array.isArray(response.records)) return { ok: false, reason: response?.error || 'no_records' };
    const local = await getRecords();
    const localIds = new Set(local.map(r => r.attemptId || r['ID único da tentativa']));
    let imported = 0;
    for (const remote of response.records) {
      const id = remote.attemptId || remote['ID único da tentativa'];
      if (!id || localIds.has(id)) continue;
      remote.attemptId = id;
      remote.sessionId = remote.sessionId || remote['ID único da sessão'];
      const parsedDate = new Date(`${remote['Data']} ${remote['Hora']}`);
      remote.createdAt = remote.createdAt || (Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString());
      remote.syncStatus = 'synced';
      remote['Estado de sincronização'] = 'synced';
      remote.sheetUrl = response.spreadsheetUrl || '';
      await saveRecord(remote);
      imported++;
    }
    return { ok: true, imported };
  } catch (err) {
    console.warn('Não foi possível atualizar a partir do Google Sheets', err);
    return { ok: false, reason: String(err.message || err) };
  }
}

function recordForGoogleSheets(record) {
  // Mantém todos os campos exigidos, incluindo autoavaliação e últimas pergunta/resposta/observação.
  const out = {};
  SHEET_HEADERS.forEach(h => out[h] = record[h] ?? '');
  out.attemptId = record.attemptId || record['ID único da tentativa'];
  out.sessionId = record.sessionId || record['ID único da sessão'];
  return out;
}

function jsonp(baseUrl, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cb = `jogoVisualCb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(baseUrl);
    Object.entries({ ...params, callback: cb }).forEach(([k, v]) => url.searchParams.set(k, v));
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('Tempo de sincronização excedido')), timeoutMs);
    function cleanup(err, value) {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      err ? reject(err) : resolve(value);
    }
    window[cb] = data => cleanup(null, data);
    script.onerror = () => cleanup(new Error('Falha ao contactar Google Apps Script'));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function openDatabaseSheet() {
  const apiUrl = configuredApiUrl();
  if (!apiUrl) {
    alert('Configura primeiro o URL do Google Apps Script no Dashboard. A app continua a funcionar localmente.');
    await showDashboard();
    return;
  }
  try {
    const response = await jsonp(apiUrl, { action: 'open' });
    if (response?.spreadsheetUrl) window.open(response.spreadsheetUrl, '_blank', 'noopener');
    else throw new Error(response?.error || 'Sem link da folha');
  } catch (err) {
    alert(`Erro ao abrir/criar a base de dados: ${err.message || err}`);
  }
}

function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function updateSyncBadge(kind, explicitText) {
  const badge = document.getElementById('syncBadge');
  if (!badge || !dbPromise) return;
  badge.className = '';
  if (explicitText) { badge.classList.add(kind || 'pending'); badge.textContent = explicitText; return; }
  try {
    const records = await getRecords();
    const pending = records.filter(r => ['local_only', 'pending_sync'].includes(r.syncStatus || r['Estado de sincronização'])).length;
    const errors = records.filter(r => (r.syncStatus || r['Estado de sincronização']) === 'sync_error').length;
    if (errors) { badge.classList.add('error'); badge.textContent = `${errors} erro(s) sync`; }
    else if (pending) { badge.classList.add('pending'); badge.textContent = `${pending} pendente(s)`; }
    else { badge.classList.add('synced'); badge.textContent = 'Sincronizado/local'; }
  } catch {
    badge.classList.add('pending'); badge.textContent = 'Local';
  }
}

// ===== Resultados, dashboard, histórico e gráficos com dados reais guardados =====
async function renderResultsPanel() {
  const records = await getRecords();
  const current = finalRecordBeingSaved || records[records.length - 1];
  const panel = document.getElementById('resultsPanel');
  panel.classList.remove('hidden');
  const last = records.slice(-5).reverse();
  const avgScore = average(records, 'Pontuação final');
  const bestLevel = maxOf(records, 'Nível máximo atingido');
  const syncText = current ? syncMessage(current) : 'Sem registos finais ainda.';
  panel.innerHTML = `
    <h2>Painel de Resultados</h2>
    <p class="${syncClass(current)}">${syncText}</p>
    ${current ? `<div class="grid">
      ${stat('Pontuação atual', current['Pontuação final'])}
      ${stat('Nível máximo', current['Nível máximo atingido'])}
      ${stat('Acerto', `${current['Percentagem de acerto']}%`)}
      ${stat('Autoavaliação', current['Autoavaliação do utilizador, de 0 a 10'])}
      ${stat('Média geral', avgScore.toFixed(1))}
      ${stat('Melhor nível alcançado', bestLevel)}
    </div>` : ''}
    <h3>Últimas tentativas</h3>
    ${renderRecordsTable(last)}
  `;
}

async function showDashboard(activate = true) {
  if (activate) hidePanels();
  if (configuredApiUrl() && navigator.onLine) await pullRemoteRecords();
  const records = await getRecords();
  const stats = buildStats(records);
  const panel = document.getElementById('dashboardPanel');
  panel.classList.remove('hidden');
  const apiUrl = configuredApiUrl();
  panel.innerHTML = `
    <h2>Dashboard</h2>
    <p class="muted">Os gráficos abaixo são calculados a partir dos registos reais guardados em IndexedDB e, quando configurado, sincronizados com Google Sheets.</p>
    <div class="configBox">
      <input id="apiUrlInput" value="${escapeHtml(apiUrl)}" placeholder="URL /exec do Google Apps Script para sincronização" />
      <button id="saveApiUrlBtn" type="button">Guardar URL</button>
    </div>
    ${recoveredInterruptedAttempt ? `<p class="warn">Sessão interrompida recuperada: última pergunta “${escapeHtml(recoveredInterruptedAttempt.lastQuestionPresented || '-')}”, última resposta “${escapeHtml(recoveredInterruptedAttempt.lastAnswerGiven || '-')}”, última observação “${escapeHtml(recoveredInterruptedAttempt.lastAppObservation || '-')}”.</p>` : ''}
    <div class="grid">
      ${stat('Sessões', stats.sessions)}${stat('Tentativas', stats.attempts)}${stat('Tempo total', stats.totalDuration)}
      ${stat('Melhor pontuação', stats.bestScore)}${stat('Melhor nível', stats.bestLevel)}${stat('Média acerto', `${stats.avgAccuracy}%`)}
      ${stat('Tempo médio resposta', `${stats.avgResponseTime} ms`)}${stat('Tendência últimas 10', stats.recentTrend)}${stat('Evolução desde início', `${stats.percentEvolution}%`)}
      ${stat('Dias consecutivos', stats.streakDays)}${stat('Sincronizados', stats.synced)}${stat('Pendentes', stats.pending)}
    </div>
    <div class="chartGrid">
      ${chartCard('chartScore', '1. Evolução da pontuação')}
      ${chartCard('chartLevel', '2. Evolução do nível máximo')}
      ${chartCard('chartRating', '3. Evolução da autoavaliação')}
      ${chartCard('chartCorrelation', '4. Correlação autoavaliação/desempenho')}
      ${chartCard('chartResponseTime', '5. Tempo médio de resposta')}
      ${chartCard('chartAccuracy', '6. Percentagem de acerto')}
    </div>
  `;
  document.getElementById('saveApiUrlBtn').addEventListener('click', async () => {
    localStorage.setItem(API_URL_KEY, document.getElementById('apiUrlInput').value.trim());
    await syncPendingRecords();
    await showDashboard(false);
  });
  drawAllCharts(records);
}

async function showHistory() {
  hidePanels();
  const panel = document.getElementById('historyPanel');
  const records = (await getRecords()).slice().reverse();
  panel.classList.remove('hidden');
  panel.innerHTML = `<h2>Histórico</h2>${renderRecordsTable(records)}`;
}

function renderRecordsTable(records) {
  if (!records.length) return '<p class="muted">Ainda não há registos guardados.</p>';
  return `<div class="tableWrap"><table><thead><tr><th>Data</th><th>Hora</th><th>Nível</th><th>Pontuação</th><th>Autoavaliação</th><th>Sincronização</th></tr></thead><tbody>${records.map(r => `
    <tr><td>${escapeHtml(r['Data'])}</td><td>${escapeHtml(r['Hora'])}</td><td>${escapeHtml(r['Nível máximo atingido'])}</td><td>${escapeHtml(r['Pontuação final'])}</td><td>${escapeHtml(r['Autoavaliação do utilizador, de 0 a 10'])}</td><td class="${syncClass(r)}">${escapeHtml(r['Estado de sincronização'] || r.syncStatus)}</td></tr>`).join('')}</tbody></table></div>`;
}

function buildStats(records) {
  const sessions = new Set(records.map(r => r['ID único da sessão'])).size;
  const attempts = records.length;
  const totalMs = records.reduce((sum, r) => sum + parseDuration(r['Duração da tentativa']), 0);
  const recent = records.slice(-10);
  const firstScore = Number(records[0]?.['Pontuação final'] || 0);
  const lastScore = Number(records[records.length - 1]?.['Pontuação final'] || 0);
  const recentTrend = recent.length >= 2 ? (Number(recent[recent.length - 1]['Pontuação final']) - Number(recent[0]['Pontuação final']) >= 0 ? 'a subir/estável' : 'a descer') : 'sem dados';
  return {
    sessions, attempts, totalDuration: formatDuration(totalMs),
    bestScore: maxOf(records, 'Pontuação final'), bestLevel: maxOf(records, 'Nível máximo atingido'),
    avgAccuracy: Math.round(average(records, 'Percentagem de acerto')) || 0,
    avgResponseTime: Math.round(average(records, 'Tempo médio de resposta')) || 0,
    recentTrend,
    percentEvolution: firstScore ? Math.round(((lastScore - firstScore) / Math.abs(firstScore)) * 100) : (lastScore ? 100 : 0),
    streakDays: consecutiveDays(records),
    synced: records.filter(r => (r.syncStatus || r['Estado de sincronização']) === 'synced').length,
    pending: records.filter(r => ['local_only', 'pending_sync', 'sync_error'].includes(r.syncStatus || r['Estado de sincronização'])).length
  };
}

function drawAllCharts(records) {
  drawLineChart('chartScore', records, 'Pontuação final', '#2563eb');
  drawLineChart('chartLevel', records, 'Nível máximo atingido', '#7c3aed');
  drawLineChart('chartRating', records, 'Autoavaliação do utilizador, de 0 a 10', '#0f766e', 0, 10);
  drawCorrelationChart('chartCorrelation', records);
  drawLineChart('chartResponseTime', records, 'Tempo médio de resposta', '#ea580c');
  drawLineChart('chartAccuracy', records, 'Percentagem de acerto', '#16a34a', 0, 100);
}

function drawLineChart(id, records, field, color, forcedMin = null, forcedMax = null) {
  const canvas = document.getElementById(id); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; ctx.scale(dpr, dpr);
  const w = canvas.clientWidth, h = canvas.clientHeight, pad = 32;
  ctx.clearRect(0, 0, w, h); drawAxes(ctx, w, h, pad);
  const vals = records.map(r => Number(r[field])).filter(Number.isFinite);
  if (!vals.length) return drawNoData(ctx, w, h);
  const min = forcedMin ?? Math.min(...vals, 0), max = forcedMax ?? Math.max(...vals, 1);
  const points = records.map((r, i) => ({ x: pad + (records.length === 1 ? 0.5 : i / (records.length - 1)) * (w - pad * 1.5), y: h - pad - ((Number(r[field]) - min) / ((max - min) || 1)) * (h - pad * 1.7), v: Number(r[field]) })).filter(p => Number.isFinite(p.v));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  ctx.fillStyle = color; points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#475569'; ctx.font = '11px sans-serif'; ctx.fillText(String(max), 4, pad); ctx.fillText(String(min), 4, h - pad);
}

function drawCorrelationChart(id, records) {
  const canvas = document.getElementById(id); if (!canvas) return;
  const ctx = canvas.getContext('2d'); const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; ctx.scale(dpr, dpr);
  const w = canvas.clientWidth, h = canvas.clientHeight, pad = 34;
  ctx.clearRect(0, 0, w, h); drawAxes(ctx, w, h, pad);
  const maxScore = Math.max(1, ...records.map(r => Number(r['Pontuação final']) || 0));
  records.forEach(r => {
    const rating = Number(r['Autoavaliação do utilizador, de 0 a 10']);
    const scoreNorm = (Number(r['Pontuação final']) || 0) / maxScore;
    const level = Number(r['Nível máximo atingido']) || 0;
    const acc = Number(r['Percentagem de acerto']) || 0;
    if (!Number.isFinite(rating)) return;
    const x = pad + (rating / 10) * (w - pad * 1.5);
    const y = h - pad - scoreNorm * (h - pad * 1.7);
    const radius = 4 + Math.min(10, level);
    ctx.fillStyle = `rgba(37, 99, 235, ${Math.max(0.35, acc / 100)})`;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#475569'; ctx.font = '11px sans-serif'; ctx.fillText('autoavaliação →', pad, h - 8); ctx.save(); ctx.rotate(-Math.PI / 2); ctx.fillText('pontuação ↑', -h + pad, 12); ctx.restore();
  if (!records.length) drawNoData(ctx, w, h);
}

function drawAxes(ctx, w, h, pad) {
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, 14); ctx.lineTo(pad, h - pad); ctx.lineTo(w - 12, h - pad); ctx.stroke();
}
function drawNoData(ctx, w, h) { ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.fillText('Sem dados guardados', w / 2 - 58, h / 2); }
function chartCard(id, title) { return `<div class="chartCard"><h3>${title}</h3><canvas id="${id}" width="420" height="220"></canvas></div>`; }
function stat(label, value) { return `<div class="stat"><span>${label}</span><strong>${escapeHtml(value ?? '-')}</strong></div>`; }

// ===== Exportação =====
async function exportData(type) {
  const records = await getRecords();
  if (!records.length) { alert('Ainda não há dados para exportar.'); return; }
  if (type === 'csv') downloadBlob(toCsv(records), 'jogo-visual-dados.csv', 'text/csv;charset=utf-8');
  if (type === 'xls') downloadBlob(toExcelHtml(records), 'jogo-visual-dados.xls', 'application/vnd.ms-excel;charset=utf-8');
  if (type === 'pdf') {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Jogo Visual - Dados</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%;font-size:10px}td,th{border:1px solid #ddd;padding:4px}</style></head><body><h1>Jogo Visual</h1>${toHtmlTable(records)}</body></html>`);
    win.document.close(); win.focus(); win.print();
  }
  document.getElementById('exportModal').classList.add('hidden');
}
function toCsv(records) { return [SHEET_HEADERS.join(','), ...records.map(r => SHEET_HEADERS.map(h => csvCell(r[h])).join(','))].join('\n'); }
function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
function toExcelHtml(records) { return `<html><head><meta charset="utf-8"></head><body>${toHtmlTable(records)}</body></html>`; }
function toHtmlTable(records) { return `<table><thead><tr>${SHEET_HEADERS.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${records.map(r => `<tr>${SHEET_HEADERS.map(h => `<td>${escapeHtml(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
function downloadBlob(content, filename, type) { const blob = new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }

// ===== Utilitários =====
function createId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
function nextSessionNumber() { const n = Number(localStorage.getItem(SESSION_COUNTER_KEY) || 0) + 1; localStorage.setItem(SESSION_COUNTER_KEY, String(n)); return n; }
function formatDuration(ms) { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; }
function parseDuration(str) { const parts = String(str || '0:0:0').split(':').map(Number); return ((parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)) * 1000; }
function average(records, field) { const vals = records.map(r => Number(r[field])).filter(Number.isFinite); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function maxOf(records, field) { const vals = records.map(r => Number(r[field])).filter(Number.isFinite); return vals.length ? Math.max(...vals) : 0; }
function consecutiveDays(records) { const days = [...new Set(records.map(r => new Date(r.createdAt || `${r.Data} ${r.Hora}`).toISOString().slice(0, 10)))].sort().reverse(); if (!days.length) return 0; let streak = 0; let cursor = new Date(); for (const d of days) { const iso = cursor.toISOString().slice(0, 10); if (d === iso) { streak++; cursor.setDate(cursor.getDate() - 1); } else if (streak === 0) { cursor.setDate(cursor.getDate() - 1); } else break; } return streak; }
function quadrantStats(errors) { const all = ['superior esquerdo', 'superior direito', 'inferior esquerdo', 'inferior direito']; const counts = Object.fromEntries(all.map(q => [q, 0])); errors.forEach(e => { const q = e.x < FIX_X ? (e.y < FIX_Y ? 'superior esquerdo' : 'inferior esquerdo') : (e.y < FIX_Y ? 'superior direito' : 'inferior direito'); counts[q]++; }); const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]); return { more: sorted[0][1] ? sorted[0][0] : 'sem erros', less: sorted.slice().reverse()[0][0] }; }
function syncMessage(r) { if (!r) return ''; const st = r.syncStatus || r['Estado de sincronização']; if (st === 'synced') return 'Resultado sincronizado com Google Sheets.'; if (st === 'sync_error') return 'Erro de sincronização. Os dados continuam guardados localmente.'; if (!navigator.onLine) return 'Sem internet. Será sincronizado mais tarde.'; return 'Resultado guardado localmente.'; }
function syncClass(r) { const st = r?.syncStatus || r?.['Estado de sincronização']; return st === 'synced' ? 'ok' : st === 'sync_error' ? 'bad' : 'warn'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
