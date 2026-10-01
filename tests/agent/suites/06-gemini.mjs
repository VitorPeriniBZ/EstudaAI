import fs from "node:fs";
import path from "node:path";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "fixtures");
const B=process.env.AGENT_BASE_URL; let pass=0, fail=0;
const ok=(c,n,x="")=>{ if(c){pass++;console.log("  ✔",n);} else {fail++;console.log("  ✘",n,x);} };
async function login(code){ const r1=await fetch(B+"/api/auth/google",{redirect:"manual"});
  const c1=r1.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "); const st=new URL(r1.headers.get("location")).searchParams.get("state");
  const r2=await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`,{redirect:"manual",headers:{cookie:c1}});
  return r2.headers.getSetCookie().find(c=>c.startsWith("estudaai_sid=")).split(";")[0]; }
async function t(ck,p,input,q){ const url=`${B}/api/trpc/${p}`+(q?`?input=${encodeURIComponent(JSON.stringify({json:input??null}))}`:"");
  const r=await fetch(url,{method:q?"GET":"POST",headers:{"content-type":"application/json",cookie:ck},body:q?undefined:JSON.stringify({json:input??null})});
  const j=await r.json(); return { data:j.result?.data?.json, error:j.error?.json }; }
const last = async()=> (await fetch("http://localhost:4003/last")).json();

const A = await login("code-ana");
const me = (await t(A,"auth.me",null,true)).data; ok(me.role==="admin","login admin");
// limpa provedores antigos
for (const p of (await t(A,"admin.listProviders",null,true)).data) await t(A,"admin.deleteProvider",{id:p.id});

console.log("\nCenário do print: modelo \"Gemini\" (inválido)");
const bad = await t(A,"admin.createProvider",{name:"GEMINI",type:"google",apiKey:"AQ.Ab8RN6-test-key",baseUrl:"http://localhost:4003/v1beta",model:"Gemini",priority:10,vision:true});
ok(bad.data?.id, "cadastro com tipo Google Gemini aceito", JSON.stringify(bad.error));
const tb = await t(A,"admin.testProvider",{id:bad.data.id});
console.log("   teste:", tb.data?.message);
ok(tb.data?.ok===false && /Modelo/i.test(tb.data.message), "erro aponta o modelo inválido");

console.log("\nChave errada");
await t(A,"admin.updateProvider",{id:bad.data.id, model:"gemini-2.5-flash", apiKey:"AQ.chave-errada"});
const tk = await t(A,"admin.testProvider",{id:bad.data.id});
console.log("   teste:", tk.data?.message);
ok(tk.data?.ok===false && /Chave/i.test(tk.data.message) && /API key not valid/.test(tk.data.message), "erro diz que é a chave, com o detalhe do Google");

console.log("\nConfiguração certa");
await t(A,"admin.updateProvider",{id:bad.data.id, apiKey:"AQ.Ab8RN6-test-key"});
const tg = await t(A,"admin.testProvider",{id:bad.data.id});
ok(tg.data?.ok===true, "teste do provedor OK", JSON.stringify(tg));
const req = await last();
ok(req.keyHeader==="AQ.Ab8RN6-test-key" && !req.auth, "chave vai no cabeçalho x-goog-api-key (não em Bearer)", JSON.stringify(req));
ok(req.url.startsWith("/v1beta/models/gemini-2.5-flash:generateContent"), "endpoint nativo do Gemini");
const s = (await t(A,"subjects.create",{name:"Parasito"})).data.id;
await t(A,"materials.createNote",{subjectId:s,title:"n",content:"Ascaris lumbricoides vive no jejuno e faz ciclo pulmonar."});
const q = await t(A,"study.generateQuiz",{subjectId:s,count:25});
ok(q.data?.count===25, "quiz de 25 questões gerado com Gemini (como no print)", JSON.stringify(q.error));
const c = await t(A,"study.chatSend",{subjectId:s,message:"Onde vive o Ascaris?"});
ok(c.data?.answer?.includes("Gemini"), "chat respondeu via Gemini");
const png = fs.readFileSync(path.join(FIX, "foto.png")).toString("base64");
const im = await t(A,"materials.uploadFile",{subjectId:s,name:"foto.png",contentBase64:png,contentType:"image/png"});
ok(im.data?.status==="ready" && im.data.textContent.includes("Ascaris"), "leitura de imagem via Gemini", JSON.stringify(im.data?.statusMsg ?? im.error));
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
