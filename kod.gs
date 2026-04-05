// ================================================================
//  Flota PWA — Google Apps Script backend  v2.0
//  Execute as: Me | Access: Anyone
// ================================================================

const SPREADSHEET_ID  = '1w-43CG9vbnGpw69NH77p3syNa97Q16ZufKy5JDY6lOs';
const LECZNICE_SS_ID  = '13rz83pkmAhLypDqZaWsghm5n3iRREOQ8C0KCaXTAWgc';
const DRIVE_ROOT_ID   = '1mho1HAZpaZv0REBG7AYWWsuHhTiy5vYd';

function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;
    if (action !== 'getConfig') {
      const driver = verifyToken(payload.token);
      if (!driver) return corsResponse({ status: 'error', message: 'Nieznany token' });
      payload._driver = driver;
    }
    switch (action) {
      case 'getConfig':    return corsResponse(getConfig());
      case 'uploadPhotos': return corsResponse(uploadPhotos(payload));
      case 'saveNote':     return corsResponse(saveNote(payload));
      case 'saveResource': return corsResponse(saveResource(payload));
      case 'registerPush': return corsResponse(registerPush(payload));
      case 'getMessages':  return corsResponse(getMessages(payload));
      default:             return corsResponse({ status: 'error', message: 'Nieznana akcja: ' + action });
    }
  } catch (err) {
    return corsResponse({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  return corsResponse({ status: 'ok', message: 'Flota PWA API v2.0' });
}

function verifyToken(token) {
  if (!token) return null;
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('KURIERZY');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token && data[i][2] === true) return data[i][0];
  }
  return null;
}

function getConfig() {
  const leczSS    = SpreadsheetApp.openById(LECZNICE_SS_ID);
  const autoSheet = leczSS.getSheetByName('AUTO');
  let vehicles = ['WWL6637N','WWL8893U','WWL2889V','WY173EY','WY174EY',
                  'WY041EY','WWL2887V','WGM7719C','WGM7718C','HYUNDAI','TOYOTA'];
  if (autoSheet) {
    const raw = autoSheet.getRange('A2:A12').getValues();
    const fromSheet = raw.map(r => r[0]).filter(v => v && v.toString().trim() !== '');
    if (fromSheet.length > 0) vehicles = fromSheet;
  }
  const lecSheet = leczSS.getSheetByName('LECZNICE') || leczSS.getSheets()[0];
  const lecData  = lecSheet.getDataRange().getValues();
  const clinics  = lecData.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ id: r[0], name: r[1].toString() }));
  return { status: 'ok', vehicles, clinics };
}

function uploadPhotos(payload) {
  const { _driver, vehicle, photos } = payload;
  if (!vehicle) return { status: 'error', message: 'Brak rejestracji' };
  if (!photos || !photos.length) return { status: 'error', message: 'Brak zdjec' };
  const root        = DriveApp.getFolderById(DRIVE_ROOT_ID);
  const vehicleDir  = getOrCreateFolder(root, vehicle);
  const now         = new Date();
  const sessionName = Utilities.formatDate(now, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm') + ' ' + _driver;
  const sessionDir  = vehicleDir.createFolder(sessionName);
  for (let i = 0; i < photos.length; i++) {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(photos[i]), 'image/jpeg',
      'foto_' + String(i + 1).padStart(2, '0') + '.jpg'
    );
    sessionDir.createFile(blob);
  }
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet  = ss.getSheetByName('LOGI_ZDJECIA');
  const lastId = sheet.getLastRow() > 1 ? sheet.getRange(sheet.getLastRow(), 1).getValue() : 0;
  sheet.appendRow([
    lastId + 1,
    Utilities.formatDate(now, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss'),
    _driver, vehicle, sessionDir.getUrl()
  ]);
  return { status: 'ok', folder: sessionDir.getUrl(), count: photos.length };
}

function getOrCreateFolder(parent, name) {
  const iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : parent.createFolder(name);
}

function saveNote(payload) {
  const { _driver, vehicle, note } = payload;
  if (!vehicle) return { status: 'error', message: 'Brak pojazdu' };
  if (!note)    return { status: 'error', message: 'Brak tresci' };
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
  const lecSS    = SpreadsheetApp.openById(LECZNICE_SS_ID);
  const lecSheet = lecSS.getSheetByName('AUTOSerwis');
  const lastId   = lecSheet.getLastRow() > 1 ? lecSheet.getRange(lecSheet.getLastRow(), 1).getValue() : 0;
  lecSheet.appendRow([lastId + 1, dateStr, vehicle, _driver, note, '']);
  const fpSS    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const fpSheet = fpSS.getSheetByName('NOTATKI');
  const lastId2 = fpSheet.getLastRow() > 1 ? fpSheet.getRange(fpSheet.getLastRow(), 1).getValue() : 0;
  fpSheet.appendRow([lastId2 + 1, dateStr, _driver, vehicle, note]);
  return { status: 'ok' };
}

function saveResource(payload) {
  const { _driver, vehicle, clinic, items } = payload;
  const clinicId = typeof clinic === 'object' ? clinic.id   : clinic;
  if (!vehicle)  return { status: 'error', message: 'Brak pojazdu' };
  if (!clinicId) return { status: 'error', message: 'Brak lecznicy' };
  if (!items)    return { status: 'error', message: 'Brak zasobow' };
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
  const lecSS    = SpreadsheetApp.openById(LECZNICE_SS_ID);
  const lecSheet = lecSS.getSheetByName('ZASOBY_WYDANE');
  const lastId   = lecSheet.getLastRow() > 1 ? lecSheet.getRange(lecSheet.getLastRow(), 1).getValue() : 0;
  lecSheet.appendRow([lastId + 1, clinicId, dateStr, items, 1, _driver]);
  const fpSS    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const fpSheet = fpSS.getSheetByName('ZASOBY_WYDANE');
  const lastId2 = fpSheet.getLastRow() > 1 ? fpSheet.getRange(fpSheet.getLastRow(), 1).getValue() : 0;
  fpSheet.appendRow([lastId2 + 1, clinicId, dateStr, items, 1, _driver]);
  return { status: 'ok' };
}

function registerPush(payload) {
  const { _driver, subscription } = payload;
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet   = ss.getSheetByName('PUSH_SUBS');
  if (!sheet) {
    sheet = ss.insertSheet('PUSH_SUBS');
    sheet.appendRow(['Kierowca', 'Subscription JSON', 'Data']);
  }
  const data = sheet.getDataRange().getValues();
  let found  = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === _driver) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[JSON.stringify(subscription), new Date()]]);
      found = true; break;
    }
  }
  if (!found) sheet.appendRow([_driver, JSON.stringify(subscription), new Date()]);
  return { status: 'ok' };
}

function getMessages(payload) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('KOMUNIKATY');
  if (!sheet) return { status: 'ok', messages: [] };
  const data   = sheet.getDataRange().getValues();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const msgs   = data.slice(1)
    .filter(r => r[1] instanceof Date && r[1].getTime() > cutoff)
    .map(r => ({
      id:   r[0],
      date: Utilities.formatDate(r[1], 'Europe/Warsaw', 'HH:mm'),
      text: r[2].toString()
    }));
  return { status: 'ok', messages: msgs };
}

function sendPushToAll(message) {
  Logger.log('Push: ' + message);
}