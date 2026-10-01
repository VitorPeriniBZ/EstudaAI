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
const leak = s => /admin|provedor|chave|api key|anthropic|openai|gemini|ADMIN/i.test(s ?? "");

const A=await login("code-ana"), U=await login("code-bia");
const sa=(await t(A,"subjects.create",{name:"Matéria A"})).data.id, su=(await t(U,"subjects.create",{name:"Matéria U"})).data.id;
await t(A,"materials.createNote",{subjectId:sa,title:"n",content:"Ascaris vive no jejuno."});
await t(U,"materials.createNote",{subjectId:su,title:"n",content:"Ascaris vive no jejuno."});

console.log("\nSem nenhuma IA cadastrada");
const qa=await t(A,"study.generateQuiz",{subjectId:sa,count:5}), qu=await t(U,"study.generateQuiz",{subjectId:su,count:5});
console.log("   admin vê :", qa.error.message); console.log("   usuário vê:", qu.error.message);
ok(qa.error.message.includes("Admin"), "admin recebe a orientação técnica");
ok(!leak(qu.error.message), "usuário recebe mensagem neutra (sem admin/provedor/chave)");
ok(!qu.error.data?.stack, "sem stack trace no erro do usuário");

const png=fs.readFileSync(path.join(FIX, "foto.png")).toString("base64");
const iu=await t(U,"materials.uploadFile",{subjectId:su,name:"foto.png",contentBase64:png,contentType:"image/png"});
const ia=await t(A,"materials.uploadFile",{subjectId:sa,name:"foto.png",contentBase64:png,contentType:"image/png"});
console.log("   imagem (usuário):", iu.data?.statusMsg); console.log("   imagem (admin)  :", ia.data?.statusMsg);
ok(iu.data?.status==="error" && !leak(iu.data.statusMsg), "aviso da imagem para o usuário é neutro");
ok(ia.data?.statusMsg.includes("Admin"), "admin vê o detalhe da imagem");

console.log("\nCom um provedor que sempre falha (429)");
await t(A,"admin.createProvider",{name:"Provedor X secreto",type:"openai",apiKey:"sk-xxxxxxxxxx",baseUrl:"http://localhost:4002/fail/v1",model:"m",priority:1});
const fu=await t(U,"study.chatSend",{subjectId:su,message:"oi"}), fa=await t(A,"study.chatSend",{subjectId:sa,message:"oi"});
console.log("   usuário vê:", fu.error?.message); console.log("   admin vê  :", fa.error?.message?.slice(0,110)+"…");
ok(!leak(fu.error?.message) && !fu.error.message.includes("Provedor X"), "nome do provedor não vaza para o usuário");
ok(fa.error?.message.includes("Provedor X"), "admin vê qual provedor falhou");

console.log("\nPainel admin");
const lu=await t(U,"admin.listProviders",null,true);
console.log("   usuário vê:", lu.error?.message);
ok(lu.error?.data?.code==="FORBIDDEN" && !leak(lu.error.message), "acesso negado sem mencionar admin");
ok((await t(A,"admin.listProviders",null,true)).data?.length===1, "admin continua acessando normalmente");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
