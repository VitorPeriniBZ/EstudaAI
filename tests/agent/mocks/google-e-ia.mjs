import http from "node:http";
import * as jose from "jose";

const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
const jwk = { ...(await jose.exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const ISS = "http://localhost:4001";
// codes emitidos -> perfil
const profiles = { "code-ana": { sub: "g-ana", email: "ana@example.com", name: "Ana Admin" },
                   "code-bia": { sub: "g-bia", email: "bia@example.com", name: "Bia Aluna" } };

function body(req) { return new Promise(r => { let d=""; req.on("data", c => d+=c); req.on("end", () => r(d)); }); }

http.createServer(async (req, res) => {
  if (req.url === "/certs") { res.setHeader("content-type","application/json"); return res.end(JSON.stringify({ keys: [jwk] })); }
  if (req.url === "/token" && req.method === "POST") {
    const p = new URLSearchParams(await body(req));
    const prof = profiles[p.get("code")];
    const ok = prof && p.get("client_id")==="test-client" && p.get("client_secret")==="test-secret"
      && p.get("code_verifier")?.length >= 43 && p.get("redirect_uri")===process.env.AGENT_BASE_URL + "/api/auth/google/callback";
    if (!ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: "invalid_grant", got: Object.fromEntries(p) })); }
    const id_token = await new jose.SignJWT({ ...prof, email_verified: true, picture: "https://x/y.png" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISS).setAudience("test-client")
      .setSubject(prof.sub).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    res.setHeader("content-type","application/json");
    return res.end(JSON.stringify({ access_token: "x", id_token, token_type: "Bearer" }));
  }
  res.statusCode = 404; res.end();
}).listen(4001);

// --- IA OpenAI-compatível falsa: /fail/v1 sempre 429, /ok/v1 responde ---
let calls = { fail: 0, ok: 0 };
http.createServer(async (req, res) => {
  if (req.url === "/stats") return res.end(JSON.stringify(calls));
  const raw = await body(req);
  // /badjson → erro do Groq quando o modelo erra o formato; /flaky → erra 1x e depois acerta;
  // /reject → recusa genérica (400); /badkey → chave inválida (401)
  const route = req.url.split("/")[1];
  calls[route] = (calls[route] || 0) + 1;
  const wantsStructured = raw.includes('"response_format"');
  // /nostructured → provedor que não aceita response_format (como alguns modelos)
  if (route === "nostructured" && wantsStructured) {
    res.statusCode = 400; res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: { message: "response_format `json_schema` is not supported with this model", type: "invalid_request_error" } }));
  }
  if ((route === "badjson" && wantsStructured) || (route === "flaky" && calls[route] % 2 === 1)) {
    res.statusCode = 400; res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: { message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.", type: "invalid_request_error", code: "json_validate_failed" } }));
  }
  if (route === "reject") {
    res.statusCode = 400; res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: { message: "The request was rejected by the content policy.", type: "invalid_request_error" } }));
  }
  if (route === "badkey") {
    res.statusCode = 401; res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: { message: "API key is invalid.", type: "authentication_error" } }));
  }
  const which = route === "fail" ? "fail" : "ok";
  if (which === "fail") { res.statusCode = 429; res.setHeader("content-type","application/json");
    return res.end(JSON.stringify({ error: { message: "rate limited", type: "rate_limit" } })); }
  const j = JSON.parse(raw);
  const allText = JSON.stringify(j.messages);
  let content;
  const schema = j.response_format?.json_schema?.schema;
  // imita o modo estrito do Groq/OpenAI: todo campo em "required", sem min/max
  if (schema) {
    const errs = [];
    const walk = (n, path) => {
      if (!n || typeof n !== "object") return;
      for (const k of ["minItems","maxItems","minimum","maximum","minLength","maxLength"]) if (k in n) errs.push(`${path}: '${k}' not supported`);
      if (n.type === "object") {
        const props = Object.keys(n.properties || {}), req = n.required || [];
        const miss = props.filter(p => !req.includes(p));
        if (miss.length) errs.push(`${path}/required: \`required\` is required to be supplied and to be an array including every key in properties. The following properties must be listed in \`required\`: ${miss.join(", ")}`);
        for (const p of props) walk(n.properties[p], path + "/" + p);
      }
      if (n.items) walk(n.items, path + "[]");
    };
    walk(schema, "'response'");
    if (errs.length) { res.statusCode = 400; res.setHeader("content-type","application/json");
      return res.end(JSON.stringify({ error: { message: "invalid JSON schema for response_format: " + errs[0], type: "invalid_request_error" } })); }
  }
  if (schema?.properties?.questions) {
    const n = Number((allText.match(/exatamente (\d+) quest/)||[])[1] || 5);
    content = JSON.stringify({ title: "Quiz de teste", topics: ["Ascaris", "Enterobius"], questions: Array.from({length:n},(_,i)=>({
      topic: i%2 ? "Enterobius" : "Ascaris", question: `Pergunta ${i+1}?`, options: ["A","B","C","D"], answerIndex: i%4, explanation: "Porque sim." })) });
  } else if (schema?.properties?.cards) {
    const n = Number((allText.match(/exatamente (\d+) flashcards/)||[])[1] || 5);
    content = JSON.stringify({ cards: Array.from({length:n},(_,i)=>({ front:`Termo ${i+1}`, back:`Definição ${i+1}` })) });
  } else if (allText.includes("Responda SOMENTE com um objeto JSON")) {
    // modo texto: o modelo responde com o JSON entre crases e uma frase antes
    const n = Number((allText.match(/exatamente (\d+) (quest|flashcards)/) || [])[1] || 5);
    const obj = allText.includes("flashcards de estudo")
      ? { cards: Array.from({ length: n }, (_, i) => ({ front: `Termo ${i + 1}`, back: `Definição ${i + 1}` })) }
      : { title: "Quiz (texto)", topics: ["Ascaris", "Enterobius"], questions: Array.from({ length: n }, (_, i) => ({
          topic: i % 2 ? "Enterobius" : "Ascaris", question: `Pergunta ${i + 1}?`, options: ["A", "B", "C", "D"], answerIndex: i % 4, explanation: "Porque sim." })) };
    content = "Claro! Aqui está o resultado:\n```json\n" + JSON.stringify(obj, null, 2) + "\n```";
  } else if (allText.includes("image_url")) {
    content = "Texto transcrito da imagem: ciclo do Ascaris lumbricoides no intestino delgado.";
  } else if (allText.includes("RESUMO DE ESTUDO")) {
    content = "## Resumo\n**Ascaris** vive no jejuno.";
  } else if (allText.includes("palavra: ok")) {
    content = "ok";
  } else if (allText.includes("tabela")) {
    if (allText.includes("demorado")) await new Promise((r) => setTimeout(r, 3000));
    content = "## Comparação\n\n| Parasita | Habitat | Diagnóstico |\n|---|---|---|\n| **Enterobius** | Ceco | 1. Graham<br>2. Fezes |\n| Ascaris | Jejuno | Fezes |";
  } else {
    content = "Resposta do tutor: o oxiúros causa prurido anal noturno.";
  }
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({ id:"c1", object:"chat.completion", created: 1, model: j.model,
    choices:[{ index:0, finish_reason:"stop", message:{ role:"assistant", content } }],
    usage:{ prompt_tokens:10, completion_tokens:10, total_tokens:20 } }));
}).listen(4002);
console.log("mocks up");
