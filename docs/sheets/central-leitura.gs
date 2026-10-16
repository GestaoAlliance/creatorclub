/**
 * Creator Club — leitura da Central de creators (D-SHEETREADONLY). SÓ LÊ: este script não escreve nada na planilha.
 *
 * Fica num projeto separado na conta da marca (script.google.com → Novo projeto), não dentro da planilha.
 * 1. Cole este arquivo inteiro e troque SEGREDO pelo segredo dos formulários (FORMS_SECRET).
 * 2. Salve. Escolha a função "instalar" e clique em Executar. Aceite as permissões com a conta da marca.
 * A cada 15 minutos ele lê as abas CREATORS, PRESCRITORES e UGC e manda para o sistema. No sistema, só a célula que
 * mudou desde a leitura anterior entra (a primeira leitura só marca o ponto de partida).
 */
var PLANILHA_ID = "1kyLKVKIo2C6tIZ2aZ3yHEMaCOMEkfuGFdLxwfwPZTsI"; // Central - Creators Botanika
var URL_DO_PAINEL = "https://creatorclub-six.vercel.app/api/sheets/";
var MARCA = "botanika";
var SEGREDO = "COLE_AQUI_O_SEGREDO";
var ABAS = ["CREATORS", "PRESCRITORES", "UGC"];

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "ler") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("ler").timeBased().everyMinutes(15).create();
  ler();
}

/** Lê as abas e manda as linhas ao sistema. Não escreve nada na planilha. */
function ler() {
  var planilha = SpreadsheetApp.openById(PLANILHA_ID);
  var linhas = [];
  planilha.getSheets().forEach(function (aba) {
    var n = normal_(aba.getName()).replace(/[^A-Z]/g, "");
    if (!ABAS.some(function (a) { return n === a || n === a + "S"; })) return;
    var dados = aba.getDataRange().getDisplayValues();
    var cab = -1;
    for (var i = 0; i < Math.min(5, dados.length); i++) {
      if (dados[i].some(function (v) { return normal_(v) === "NOME COMPLETO"; })) { cab = i; break; }
    }
    if (cab < 0) return;
    var titulos = dados[cab].map(function (v) { return String(v).trim(); });
    for (var r = cab + 1; r < dados.length; r++) {
      var valores = {};
      titulos.forEach(function (t, c) {
        if (t && !(t in valores)) valores[t] = dados[r][c]; // título repetido: vale só a primeira coluna
      });
      linhas.push({ tab: aba.getName(), row: r + 1, values: valores });
    }
  });
  var res = UrlFetchApp.fetch(URL_DO_PAINEL + MARCA + "/central/leitura", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + SEGREDO },
    payload: JSON.stringify({ rows: linhas }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error("Creator Club respondeu " + res.getResponseCode() + ": " + res.getContentText());
  Logger.log(res.getContentText());
}

function normal_(t) {
  return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
