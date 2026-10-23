/**
 * Creator Club — leitura das planilhas da VermeFree (D-SHEETREADONLY, S4). SÓ LÊ: este script não escreve nada nas planilhas.
 * Mesmo script da Botanika (docs/sheets/leitura.gs), com a marca e os códigos das planilhas da VermeFree.
 *
 * Fica num projeto separado do Apps Script na conta da marca (script.google.com), não dentro das planilhas.
 * Cole este arquivo inteiro, troque SEGREDO pelo segredo dos formulários (FORMS_SECRET), salve e execute "instalar".
 * A cada 15 minutos lê cada planilha da lista e manda as linhas para o sistema (a de pagamentos é só para conferência).
 */
var URL_DO_PAINEL = "https://creatorclub-six.vercel.app/api/sheets/";
var MARCA = "vermefree";
var SEGREDO = "COLE_AQUI_O_SEGREDO";

// planilha: como o sistema chama; id: o código no link da planilha; abas: só essas (vazio = todas).
var PLANILHAS = [
  // Central de creators da VermeFree: cole o código do link (docs.google.com/spreadsheets/d/CÓDIGO/edit) e as abas.
  { planilha: "central", id: "COLE_AQUI_O_ID_DA_CENTRAL", abas: [] },
  { planilha: "envios", id: "1OiLAwClYkAvj9x1cS_WMzSxVtv18cEkfKwqkGlDlTFA", abas: [] }, // Envios - Vermefree
  // Pagamentos de influencers da VermeFree (só conferência): cole o código do link.
  { planilha: "pagamentos", id: "COLE_AQUI_O_ID_DOS_PAGAMENTOS", abas: [] },
];

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "ler") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("ler").timeBased().everyMinutes(15).create();
  ler();
}

function ler() {
  PLANILHAS.forEach(function (p) {
    if (/^COLE/.test(p.id)) return; // planilha ainda sem o código: pula
    var linhas = [];
    SpreadsheetApp.openById(p.id).getSheets().forEach(function (aba) {
      var n = normal_(aba.getName()).replace(/[^A-Z]/g, "");
      if (p.abas.length && !p.abas.some(function (a) { return n === a || n === a + "S"; })) return;
      var dados = aba.getDataRange().getDisplayValues();
      var cab = -1;
      for (var i = 0; i < Math.min(6, dados.length); i++) {
        if (dados[i].some(function (v) { var t = normal_(v); return t === "NOME COMPLETO" || t === "NOME"; })) { cab = i; break; }
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
    var res = UrlFetchApp.fetch(URL_DO_PAINEL + MARCA + "/" + p.planilha + "/leitura", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + SEGREDO },
      payload: JSON.stringify({ rows: linhas }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) throw new Error(p.planilha + ": Creator Club respondeu " + res.getResponseCode() + ": " + res.getContentText());
    Logger.log(res.getContentText());
  });
}

function normal_(t) {
  return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
