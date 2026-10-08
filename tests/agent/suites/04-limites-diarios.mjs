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
const A=await login("code-ana"), U=await login("code-bia");
await t(A,"admin.createProvider",{name:"OK",type:"openai",apiKey:"sk-ok-1234567",baseUrl:"http://localhost:4002/ok/v1",model:"m",priority:1});
const s=(await t(U,"subjects.create",{name:"P"})).data.id;
await t(U,"materials.createNote",{subjectId:s,title:"n",content:"Ascaris vive no jejuno."});
const usage=async()=>(await t(U,"account.usage",null,true)).data;

console.log("\nGratuito — limites novos");
let u=await usage();
ok(u.limits.maxSummariesPerDay===2 && u.limits.maxFlashcards===15 && u.limits.maxChatPerDay===5, "limites: 2 resumos/dia, 15 flashcards, 5 perguntas/dia");
const fc20=await t(U,"study.generateFlashcards",{subjectId:s,count:20});
console.log("   20 flashcards:", fc20.error?.message);
ok(fc20.error?.data?.code==="FORBIDDEN" && /15/.test(fc20.error.message) && /40/.test(fc20.error.message), "20 flashcards bloqueado (cita 15 e 40)");
ok((await t(U,"study.generateFlashcards",{subjectId:s,count:15})).data?.count===15, "15 flashcards liberados");
ok((await t(U,"study.generateSummary",{subjectId:s})).data && (await t(U,"study.generateSummary",{subjectId:s})).data, "2 resumos no dia liberados");
const r3=await t(U,"study.generateSummary",{subjectId:s});
console.log("   3º resumo:", r3.error?.message);
ok(r3.error?.data?.code==="FORBIDDEN" && /2 resumos por dia/.test(r3.error.message), "3º resumo do dia bloqueado");
u=await usage(); ok(u.usage.summariesToday===2 && u.usage.generations===3, "resumo bloqueado não consumiu geração", JSON.stringify(u.usage));
let chatOk=0; for (let i=0;i<5;i++) if ((await t(U,"study.chatSend",{subjectId:s,message:"dúvida "+i})).data) chatOk++;
ok(chatOk===5, "5 perguntas no chat liberadas");
const c6=await t(U,"study.chatSend",{subjectId:s,message:"6ª"});
console.log("   6ª pergunta:", c6.error?.message);
ok(c6.error?.data?.code==="FORBIDDEN" && /5 perguntas/.test(c6.error.message), "6ª pergunta do dia bloqueada");
await t(U,"study.chatClear",{subjectId:s});
ok((await t(U,"study.chatSend",{subjectId:s,message:"de novo"})).error?.data?.code==="FORBIDDEN", "apagar o histórico não zera o limite");
u=await usage(); ok(u.usage.chatToday===5 && u.usage.generations===3, "chat não conta nas gerações do mês", JSON.stringify(u.usage));
const ch=await Promise.all(Array.from({length:4},()=>t(A,"admin.listUsers",null,true)));
const bia=ch[0].data.find(x=>x.email==="bia@example.com");
ok(bia.generationsThisMonth===3 && bia.chatToday===5, "painel admin separa gerações e perguntas", JSON.stringify(bia));

console.log("\nLeitura de imagem com IA — limite diário (Gratuito: 10)");
const png=fs.readFileSync(path.join(FIX,"foto.png")).toString("base64");
const up=()=>t(U,"materials.uploadFile",{subjectId:s,name:"foto.png",contentBase64:png,contentType:"image/png"});
const semVisao=await up();
ok(semVisao.data?.status==="error", "sem IA de visão a leitura falha", JSON.stringify(semVisao.data?.statusMsg ?? semVisao.error?.message));
u=await usage(); ok(u.usage.extractsToday===0, "leitura que falhou não consome a vaga", JSON.stringify(u.usage));
await t(U,"materials.remove",{id:semVisao.data.id});
await t(A,"admin.createProvider",{name:"Visão",type:"openai",apiKey:"sk-ok-1234567",baseUrl:"http://localhost:4002/ok/v1",model:"m",priority:2,vision:true});
const lida=await up();
ok(lida.data?.status==="ready", "imagem lida com IA de visão", JSON.stringify(lida.data?.statusMsg ?? lida.error?.message));
const rep=await t(U,"materials.reprocess",{id:lida.data.id});
ok(rep.error?.data?.code==="BAD_REQUEST", "reprocessar material pronto é recusado (seria outra chamada paga)", JSON.stringify(rep.data?.status));
u=await usage(); ok(u.usage.extractsToday===1, "a leitura contou 1 vez", JSON.stringify(u.usage));
await t(U,"materials.remove",{id:lida.data.id});
for (let i=1;i<10;i++){ const r=await up(); if (r.data?.id) await t(U,"materials.remove",{id:r.data.id}); }
u=await usage(); ok(u.usage.extractsToday===10 && u.usage.files===0, "excluir e reenviar conta cada leitura (10 no dia)", JSON.stringify(u.usage));
const onze=await up();
console.log("   11ª imagem:", onze.error?.message);
ok(onze.error?.data?.code==="FORBIDDEN" && /10 imagens por dia/.test(onze.error.message), "11ª imagem do dia bloqueada");
u=await usage(); ok(u.usage.files===0 && u.usage.generations===3, "bloqueada antes de guardar o arquivo; leituras não contam nas gerações", JSON.stringify(u.usage));

console.log("\nPRO");
await t(A,"admin.updateUser",{id:bia.id,plan:"pro"});
u=await usage();
ok(u.plan==="pro" && u.limits.maxGenerationsPerMonth===300 && u.limits.maxChatPerDay===100 && u.limits.maxExtractsPerDay===100,
  "PRO com limites de uso justo: 300 gerações/mês, 100 perguntas e 100 imagens por dia", JSON.stringify(u.limits));
ok((await t(U,"study.generateFlashcards",{subjectId:s,count:40})).data?.count===40, "40 flashcards no PRO");
const fc45=await t(U,"study.generateFlashcards",{subjectId:s,count:45});
ok(fc45.error?.data?.code==="BAD_REQUEST", "acima de 40 recusado também no PRO (validação)");
ok((await t(U,"study.generateSummary",{subjectId:s})).data, "3º resumo do dia liberado no PRO");
let proChat=0; for (let i=0;i<3;i++) if ((await t(U,"study.chatSend",{subjectId:s,message:"pro "+i})).data) proChat++;
ok(proChat===3, "PRO libera mais perguntas que o Gratuito (8 no dia)");
// teto de uso justo: completa as 100 perguntas do dia e tenta a 101ª
u=await usage(); const falta=u.limits.maxChatPerDay-u.usage.chatToday;
for (let i=0;i<falta;i+=10) await Promise.all(Array.from({length:Math.min(10,falta-i)},(_,k)=>t(U,"study.chatSend",{subjectId:s,message:"justo "+(i+k)})));
const c101=await t(U,"study.chatSend",{subjectId:s,message:"101ª"});
console.log("   101ª pergunta no PRO:", c101.error?.message);
ok(c101.error?.data?.code==="FORBIDDEN" && /uso justo/.test(c101.error.message) && /100 perguntas/.test(c101.error.message), "101ª pergunta do dia bloqueada no PRO (uso justo)");
u=await usage(); ok(u.usage.chatToday===100, "o PRO para em 100 perguntas no dia", JSON.stringify(u.usage));
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
