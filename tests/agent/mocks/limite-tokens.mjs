import http from "node:http";
// /tpm/v1 → limite de 8000 "tokens" (≈ chars/3.5); /tiny/v1 → limite impossível
const sizes = [];
function body(req){return new Promise(r=>{let d="";req.on("data",c=>d+=c);req.on("end",()=>r(d));});}
http.createServer(async (req,res)=>{
  if (req.url==="/stats") return res.end(JSON.stringify(sizes));
  const raw = await body(req); const j = JSON.parse(raw);
  const chars = JSON.stringify(j.messages).length; const tokens = Math.round(chars/3.5) + 2000;
  const limit = req.url.startsWith("/tiny") ? 100 : 8000;
  sizes.push({ path: req.url.split("/")[1], tokens });
  res.setHeader("content-type","application/json");
  if (tokens > limit) { res.statusCode = 413;
    return res.end(JSON.stringify({error:{message:`Request too large for model \`openai/gpt-oss-120b\` in organization \`org_x\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${limit}, Requested ${tokens}, please reduce your message size and try again.`,type:"tokens",code:"rate_limit_exceeded"}})); }
  const n = Number((JSON.stringify(j.messages).match(/exatamente (\d+) quest/)||[])[1] || 5);
  const content = JSON.stringify({ title:"Quiz TPM", topics:["T"], questions: Array.from({length:n},(_,i)=>({topic:"T",question:`Q${i+1}?`,options:["A","B","C","D"],answerIndex:0,explanation:"ok"})) });
  res.end(JSON.stringify({id:"c",object:"chat.completion",created:1,model:j.model,choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
}).listen(4004);
console.log("tpm mock up");
