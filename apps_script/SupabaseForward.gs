/**
 * Dialed In: copy the Sheet into Supabase (phase 1, the shadow backend).
 *
 * Add this as a new file in the Apps Script project. It does NOT change doPost/doGet: the Sheet stays the source of
 * truth, and nothing here can break saving. Every 5 minutes it sends rows added since last time; once a day it
 * resends everything (Supabase ignores rows it already has, so that's harmless and repairs any gap).
 *
 * To turn it on:
 *   1. Project Settings > Script properties:
 *        SUPABASE_URL          https://<your project>.supabase.co
 *        SUPABASE_SERVICE_KEY  the "service_role" key from Supabase (secret: never put it in index.html)
 *   2. Run setupSupabaseForward() once from the editor and approve the permission prompt.
 * To turn it off: run stopSupabaseForward().
 */

var SUPABASE_FORWARD_BATCH = 400;

function setupSupabaseForward() {
  if (!supabaseConfig_()) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Script properties first.');
  stopSupabaseForward();
  ScriptApp.newTrigger('forwardNewRowsToSupabase').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('resendAllToSupabase').timeBased().everyDays(1).atHour(3).create();
  return resendAllToSupabase();
}

function stopSupabaseForward() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'forwardNewRowsToSupabase' || h === 'resendAllToSupabase') ScriptApp.deleteTrigger(t);
  });
}

// rows added since the last successful send
function forwardNewRowsToSupabase() {
  var cfg = supabaseConfig_();
  if (!cfg) return 0;
  var props = PropertiesService.getScriptProperties();
  var sheet = getDialedSheet_();
  var last = sheet.getLastRow();
  var sent = Number(props.getProperty('SUPABASE_SENT_ROWS') || 0);
  // Someone deleted rows by hand if the row we last sent isn't where we left it (or the Sheet got shorter).
  // Then the count alone can't be trusted, so send everything again (Supabase ignores rows it has).
  if (sent > last || (sent > 0 && rowKey_(sheet, sent) !== (props.getProperty('SUPABASE_SENT_KEY') || ''))) return resendAllToSupabase();
  if (last === sent) return 0;
  var n = sendSheetRowsToSupabase_(cfg, sheet, sent + 1, last);
  rememberSent_(props, sheet, last);
  return n;
}

// everything, again (daily repair)
function resendAllToSupabase() {
  var cfg = supabaseConfig_();
  if (!cfg) return 0;
  var sheet = getDialedSheet_();
  var last = sheet.getLastRow();
  var n = last ? sendSheetRowsToSupabase_(cfg, sheet, 1, last) : 0;
  rememberSent_(PropertiesService.getScriptProperties(), sheet, last);
  return n;
}

// how far we got, plus a fingerprint of that row so a hand edit above it is noticed next time
function rememberSent_(props, sheet, last) {
  props.setProperty('SUPABASE_SENT_ROWS', String(last));
  props.setProperty('SUPABASE_SENT_KEY', last ? rowKey_(sheet, last) : '');
}

function rowKey_(sheet, rowNo) {
  return md5Hex_(String(sheet.getRange(rowNo, 7).getValue() || '') + '|' + String(sheet.getRange(rowNo, 1).getValue() || ''));
}

function supabaseForwardStatus() {
  var props = PropertiesService.getScriptProperties();
  var msg = 'rows in Sheet: ' + getDialedSheet_().getLastRow() + ', sent: ' + (props.getProperty('SUPABASE_SENT_ROWS') || 0) +
            ', last error: ' + (props.getProperty('SUPABASE_LAST_ERROR') || 'none');
  Logger.log(msg);
  return msg;
}

function supabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL'), key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) return null;
  return { url: String(url).replace(/\/+$/, ''), key: String(key) };
}

// sends Sheet rows first..last (1-based); throws if Supabase refuses, so the pointer only moves on success
function sendSheetRowsToSupabase_(cfg, sheet, first, last) {
  var values = sheet.getRange(first, 1, last - first + 1, 7).getValues();
  var batch = [], total = 0;
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][6];
    if (typeof raw !== 'string' || raw.charAt(0) !== '{') continue;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { continue; }
    var stamp = values[i][0];
    batch.push({
      event_key: md5Hex_(raw),
      row_no: first + i,
      logged_at: stamp instanceof Date ? stamp.toISOString() : String(stamp || ''),
      payload: payload
    });
    if (batch.length >= SUPABASE_FORWARD_BATCH) { postToSupabase_(cfg, batch); total += batch.length; batch = []; }
  }
  if (batch.length) { postToSupabase_(cfg, batch); total += batch.length; }
  return total;
}

function postToSupabase_(cfg, records) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/sheet_archive?on_conflict=event_key', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    payload: JSON.stringify(records)
  });
  var code = res.getResponseCode();
  var props = PropertiesService.getScriptProperties();
  if (code >= 300) {
    var err = 'HTTP ' + code + ': ' + String(res.getContentText() || '').slice(0, 300);
    props.setProperty('SUPABASE_LAST_ERROR', new Date().toISOString() + ' ' + err);
    throw new Error('Supabase refused the rows (' + err + ')');
  }
  props.deleteProperty ? props.deleteProperty('SUPABASE_LAST_ERROR') : props.setProperty('SUPABASE_LAST_ERROR', '');
}

function md5Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  return out;
}
