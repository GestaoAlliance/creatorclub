/**
 * Creator Club — Central de creators sincronizada com o sistema, nos dois sentidos (D-SHEETSYNC).
 *
 * Como instalar (uma vez só, na planilha Central da marca):
 * 1. Abra a planilha > Extensões > Apps Script.
 * 2. Apague o que estiver lá, cole este arquivo inteiro e troque SEGREDO pelo segredo que o Claude passar
 *    (o mesmo dos formulários). Confira MARCA (botanika, vermefree ou revita-derma).
 * 3. Salve. No menu de funções escolha "instalar" e clique em Executar. Aceite as permissões com a sua conta.
 *    O "instalar" cria a coluna "ID CREATOR CLUB" no fim de cada aba, liga as creators às linhas e já traz o que
 *    está no sistema.
 *
 * Daqui em diante:
 * - Cada edição numa aba (CREATORS, PRESCRITORES, UGC) vai para o sistema na hora. Por campo, vale a alteração mais
 *   recente (planilha ou sistema).
 * - A cada 15 minutos a planilha recebe o que mudou no sistema (portal, ficha, envios) e as creators novas.
 * - Cupom não muda pela planilha: cupom diferente aparece como aviso para confirmar em Cupons.
 * - Não apague nem edite a coluna "ID CREATOR CLUB": é ela que liga a linha à creator.
 */
var URL_DO_PAINEL = "https://creatorclub-six.vercel.app/api/sheets/";
var MARCA = "botanika";
var SEGREDO = "COLE_AQUI_O_SEGREDO";
var ABAS = ["CREATORS", "PRESCRITORES", "UGC"];
var COLUNA_ID = "ID CREATOR CLUB";

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (["aoEditar", "puxar"].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  var planilha = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("aoEditar").forSpreadsheet(planilha).onEdit().create();
  ScriptApp.newTrigger("puxar").timeBased().everyMinutes(15).create();
  abas_().forEach(function (aba) { colunaId_(aba); });
  enviarTudo();
  PropertiesService.getScriptProperties().deleteProperty("ultimaVolta");
  puxar();
}

/** Envia todas as linhas (com a hora da última alteração da planilha): liga as linhas e aplica o que for mais novo. */
function enviarTudo() {
  var quando = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getLastUpdated().toISOString();
  abas_().forEach(function (aba) {
    var cab = cabecalho_(aba);
    var linhas = [];
    for (var r = cab.linha + 1; r <= aba.getLastRow(); r++) linhas.push(r);
    for (var i = 0; i < linhas.length; i += 150) enviar_(aba, cab, linhas.slice(i, i + 150), cab.titulos, quando);
  });
}

function aoEditar(e) {
  var aba = e.range.getSheet();
  if (!ehAba_(aba)) return;
  var cab = cabecalho_(aba);
  var linhas = [];
  for (var r = Math.max(e.range.getRow(), cab.linha + 1); r <= e.range.getLastRow(); r++) linhas.push(r);
  if (!linhas.length) return;
  var editadas = cab.titulos.slice(e.range.getColumn() - 1, e.range.getLastColumn());
  enviar_(aba, cab, linhas, editadas, new Date().toISOString());
}

function enviar_(aba, cab, linhas, editadas, quando) {
  if (!linhas.length) return;
  var largura = cab.titulos.length;
  var dados = linhas.map(function (r) {
    var valores = {};
    aba.getRange(r, 1, 1, largura).getValues()[0].forEach(function (v, i) {
      if (cab.titulos[i]) valores[cab.titulos[i]] = v instanceof Date ? Utilities.formatDate(v, "UTC", "yyyy-MM-dd") : v;
    });
    return { tab: aba.getName(), row: r, values: valores, edited: editadas, editedAt: quando };
  });
  var res = UrlFetchApp.fetch(URL_DO_PAINEL + MARCA + "/central", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + SEGREDO },
    payload: JSON.stringify({ rows: dados }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error("Creator Club respondeu " + res.getResponseCode() + ": " + res.getContentText());
  var colId = cab.titulos.indexOf(COLUNA_ID) + 1;
  JSON.parse(res.getContentText()).results.forEach(function (x) {
    if (x.id && colId > 0 && aba.getRange(x.row, colId).getValue() !== x.id) aba.getRange(x.row, colId).setValue(x.id);
  });
}

/** Traz o que mudou no sistema desde a última volta e reescreve as linhas (ou acrescenta as creators novas). */
function puxar() {
  var props = PropertiesService.getScriptProperties();
  var desde = props.getProperty("ultimaVolta");
  var res = UrlFetchApp.fetch(URL_DO_PAINEL + MARCA + "/central" + (desde ? "?desde=" + encodeURIComponent(desde) : ""), {
    headers: { Authorization: "Bearer " + SEGREDO },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error("Creator Club respondeu " + res.getResponseCode() + ": " + res.getContentText());
  var corpo = JSON.parse(res.getContentText());
  var mapa = {};
  abas_().forEach(function (aba) {
    var cab = cabecalho_(aba);
    var colId = cab.titulos.indexOf(COLUNA_ID);
    if (colId < 0 || aba.getLastRow() <= cab.linha) return;
    aba.getRange(cab.linha + 1, colId + 1, aba.getLastRow() - cab.linha, 1).getValues().forEach(function (v, i) {
      if (v[0]) mapa[v[0]] = { aba: aba, linha: cab.linha + 1 + i, cab: cab };
    });
  });
  corpo.rows.forEach(function (c) {
    var onde = mapa[c.id];
    if (!onde) {
      if (!c.append) return;
      var aba = SpreadsheetApp.getActive().getSheets().filter(function (s) { return normal_(s.getName()).replace(/[^A-Z]/g, "").indexOf(c.tab) === 0; })[0];
      if (!aba) return;
      var cabNova = cabecalho_(aba);
      onde = { aba: aba, linha: ultimaLinhaComNome_(aba, cabNova) + 1, cab: cabNova };
    }
    var largura = onde.cab.titulos.length;
    var range = onde.aba.getRange(onde.linha, 1, 1, largura);
    var atual = range.getValues()[0];
    var novo = atual.slice();
    onde.cab.titulos.forEach(function (t, i) {
      var chave = Object.keys(c.values).filter(function (k) { return normal_(k) === normal_(t); })[0];
      if (chave === undefined) return;
      var v = c.values[chave];
      var antes = atual[i] instanceof Date ? Utilities.formatDate(atual[i], "UTC", "dd/MM/yyyy") : String(atual[i]);
      if (antes !== v) novo[i] = v;
    });
    if (novo.some(function (v, i) { return v !== atual[i]; })) range.setValues([novo]);
  });
  props.setProperty("ultimaVolta", corpo.now);
}

function abas_() {
  return SpreadsheetApp.getActive().getSheets().filter(ehAba_);
}
function ehAba_(aba) {
  var n = normal_(aba.getName()).replace(/[^A-Z]/g, "");
  return ABAS.some(function (a) { return n === a || n === a + "S"; });
}
function normal_(t) {
  return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
/** Linha dos títulos: a primeira que tem "NOME COMPLETO". */
function cabecalho_(aba) {
  var ultimaCol = aba.getLastColumn();
  var topo = aba.getRange(1, 1, Math.min(5, aba.getLastRow() || 1), ultimaCol).getValues();
  for (var i = 0; i < topo.length; i++) {
    if (topo[i].some(function (v) { return normal_(v) === "NOME COMPLETO"; })) {
      return { linha: i + 1, titulos: topo[i].map(function (v) { return String(v).trim(); }) };
    }
  }
  throw new Error("Aba " + aba.getName() + " sem a coluna NOME COMPLETO.");
}
function colunaId_(aba) {
  var cab = cabecalho_(aba);
  if (cab.titulos.indexOf(COLUNA_ID) >= 0) return;
  var ultimo = cab.titulos.length;
  while (ultimo > 0 && !cab.titulos[ultimo - 1]) ultimo--;
  aba.getRange(cab.linha, ultimo + 1).setValue(COLUNA_ID);
}
function ultimaLinhaComNome_(aba, cab) {
  var col = cab.titulos.map(normal_).indexOf("NOME COMPLETO") + 1;
  var valores = aba.getRange(cab.linha + 1, col, Math.max(1, aba.getLastRow() - cab.linha), 1).getValues();
  for (var i = valores.length - 1; i >= 0; i--) if (String(valores[i][0]).trim()) return cab.linha + 1 + i;
  return cab.linha;
}
