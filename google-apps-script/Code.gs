/**
 * Google Apps Script — Jogo Visual
 * Publicar como Web App e usar o URL /exec na app.
 * Não contém passwords, tokens, client secrets ou chaves privadas.
 */
const APP_NAME = 'Jogo Visual';
const TAB_NAME = 'Registos';
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

function doGet(e) {
  const action = String(e.parameter.action || 'open');
  try {
    if (action === 'open' || action === 'meta') return respond_(e, getMeta_());
    if (action === 'list') return respond_(e, listRecords_());
    if (action === 'sync') {
      const record = decodePayload_(e.parameter.payload || '');
      return respond_(e, appendRecordIdempotent_(record));
    }
    return respond_(e, { ok: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return respond_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const record = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    return respond_(e, appendRecordIdempotent_(record));
  } catch (err) {
    return respond_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function getMeta_() {
  const ss = ensureSpreadsheet_();
  ensureHeader_(ss);
  return { ok: true, spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), name: APP_NAME };
}

function listRecords_() {
  const ss = ensureSpreadsheet_();
  const sh = ensureHeader_(ss);
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || SHEET_HEADERS;
  const records = values.filter(row => row.some(cell => cell !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    obj.attemptId = obj['ID único da tentativa'];
    obj.sessionId = obj['ID único da sessão'];
    return obj;
  });
  return { ok: true, records, spreadsheetUrl: ss.getUrl() };
}

function appendRecordIdempotent_(record) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ensureSpreadsheet_();
    const sh = ensureHeader_(ss);
    const attemptId = String(record.attemptId || record['ID único da tentativa'] || '').trim();
    if (!attemptId) throw new Error('Registo sem ID único da tentativa.');

    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const idCol = SHEET_HEADERS.indexOf('ID único da tentativa') + 1;
      const existingIds = sh.getRange(2, idCol, lastRow - 1, 1).getValues().flat().map(String);
      if (existingIds.includes(attemptId)) {
        return { ok: true, duplicate: true, attemptId, spreadsheetUrl: ss.getUrl() };
      }
    }

    record['Estado de sincronização'] = 'synced';
    record['Data/hora da sincronização'] = new Date().toISOString();
    const row = SHEET_HEADERS.map(h => record[h] == null ? '' : record[h]);
    sh.appendRow(row);
    return { ok: true, duplicate: false, attemptId, spreadsheetUrl: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function ensureSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const storedId = props.getProperty('SPREADSHEET_ID');
  if (storedId) {
    try { return SpreadsheetApp.openById(storedId); } catch (err) { props.deleteProperty('SPREADSHEET_ID'); }
  }

  const files = DriveApp.getFilesByName(APP_NAME);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      props.setProperty('SPREADSHEET_ID', file.getId());
      return SpreadsheetApp.openById(file.getId());
    }
  }

  const ss = SpreadsheetApp.create(APP_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function ensureHeader_(ss) {
  let sh = ss.getSheetByName(TAB_NAME) || ss.getSheets()[0];
  sh.setName(TAB_NAME);
  const firstRow = sh.getRange(1, 1, 1, SHEET_HEADERS.length).getValues()[0];
  const hasHeader = firstRow.some(String);
  if (!hasHeader) {
    sh.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, SHEET_HEADERS.length);
  } else {
    // Garante alinhamento das colunas caso a folha exista com cabeçalhos incompletos.
    const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), SHEET_HEADERS.length)).getValues()[0];
    const missing = SHEET_HEADERS.filter(h => !current.includes(h));
    if (missing.length) {
      sh.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    }
  }
  return sh;
}

function decodePayload_(payload) {
  if (!payload) throw new Error('Payload vazio.');
  const bytes = Utilities.base64DecodeWebSafe(payload);
  const json = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function respond_(e, data) {
  const callback = e && e.parameter && e.parameter.callback;
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
