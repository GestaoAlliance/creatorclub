/**
 * Creator Club — envia as respostas do formulário "Captação Botanika e VermeFree" para o painel (D-CAPTACAO).
 *
 * Como instalar (uma vez só):
 * 1. Abra o formulário no Google Forms > ⋮ (três pontinhos) > Editor de scripts (Apps Script).
 * 2. Apague o que estiver lá, cole este arquivo inteiro e troque SEGREDO pelo segredo que o Claude passar.
 * 3. Salve (ícone de disquete). No menu de funções escolha "instalar" e clique em Executar.
 *    O Google pede permissão: aceite com a conta dona do formulário.
 * 4. Para mandar também as respostas antigas, escolha "enviarTodas" e clique em Executar (pode repetir: não duplica; as respostas já importadas da planilha também não duplicam).
 *
 * Daqui em diante cada resposta nova aparece em "Candidatas" no painel em segundos.
 */
var URL_DO_PAINEL = "https://creatorclub-six.vercel.app/api/forms/botanika/captacao";
var SEGREDO = "COLE_AQUI_O_SEGREDO";

function instalar() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "aoResponder") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("aoResponder").forForm(form).onFormSubmit().create();
}

function aoResponder(e) {
  enviar(e.response);
}

function enviarTodas() {
  FormApp.getActiveForm().getResponses().forEach(enviar);
}

function enviar(resposta) {
  var respostas = {};
  resposta.getItemResponses().forEach(function (r) {
    respostas[r.getItem().getTitle()] = r.getResponse();
  });
  var res = UrlFetchApp.fetch(URL_DO_PAINEL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + SEGREDO },
    payload: JSON.stringify({ responseId: resposta.getId(), submittedAt: resposta.getTimestamp().toISOString(), answers: respostas }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) console.error("Creator Club respondeu " + res.getResponseCode() + ": " + res.getContentText());
}
