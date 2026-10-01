import http from "node:http";
const KEY = "AQ.Ab8RN6-test-key";
let last = {};
function body(req){return new Promise(r=>{let d="";req.on("data",c=>d+=c);req.on("end",()=>r(d));});}
http.createServer(async (req,res)=>{
  if (req.url==="/last") return res.end(JSON.stringify(last));
  const raw = await body(req);
  const m = req.url.match(/^\/v1beta\/models\/([^:]+):generateContent/);
  res.setHeader("content-type","application/json");
  last = { url: req.url, keyHeader: req.headers["x-goog-api-key"] ?? null, auth: req.headers["authorization"] ?? null };
  if (!m) { res.statusCode=404; return res.end("{}"); }
  if (req.headers["x-goog-api-key"] !== KEY) { res.statusCode=400;
    return res.end(JSON.stringify({error:{code:400,message:"API key not valid. Please pass a valid API key.",status:"INVALID_ARGUMENT"}})); }
  if (!/^gemini-/.test(m[1])) { res.statusCode=404;
    return res.end(JSON.stringify({error:{code:404,message:`models/${m[1]} is not found for API version v1beta`,status:"NOT_FOUND"}})); }
  const j = JSON.parse(raw); const all = JSON.stringify(j);
  let text;
  if (j.generationConfig?.responseMimeType === "application/json") {
    const n = Number((all.match(/exatamente (\d+) quest/)||[])[1] || 5);
    text = JSON.stringify({ title:"Quiz Gemini", topics:["Ascaris"], questions: Array.from({length:n},(_,i)=>({topic:"Ascaris",question:`Q${i+1}?`,options:["A","B","C","D"],answerIndex:1,explanation:"ok"})) });
  } else if (all.includes("inlineData") || all.includes("inline_data")) text = "Transcrição: ciclo do Ascaris.";
  else if (all.includes("palavra: ok")) text = "ok";
  else text = "Resposta do Gemini: o Ascaris vive no jejuno.";
  res.end(JSON.stringify({candidates:[{content:{role:"model",parts:[{text}]},finishReason:"STOP",index:0}],
    usageMetadata:{promptTokenCount:5,candidatesTokenCount:5,totalTokenCount:10},modelVersion:m[1]}));
}).listen(4003);
console.log("gemini mock up");
