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
await t(A,"admin.createProvider",{name:"OK",type:"openai",apiKey:"sk-ok-1234567",baseUrl:"http://localhost:4002/ok/v1",model:"m",priority:1,vision:true});
const s=(await t(U,"subjects.create",{name:"Parasito"})).data.id;
await t(U,"materials.createNote",{subjectId:s,title:"n",content:"Ascaris vive no jejuno. Enterobius causa prurido anal."});

console.log("\nPlano Gratuito");
let u=(await t(U,"account.usage",null,true)).data;
ok(u.plan==="free" && u.limits.maxFiles===3 && u.limits.maxGenerationsPerMonth===5 && u.limits.maxQuizQuestions===25, "limites do Gratuito: 3 arquivos, 5 gerações, 25 questões");
const pdf=fs.readFileSync(path.join(FIX, "aula.pdf")).toString("base64");
for (let i=1;i<=3;i++) await t(U,"materials.uploadFile",{subjectId:s,name:`aula${i}.pdf`,contentBase64:pdf,contentType:"application/pdf"});
const up4=await t(U,"materials.uploadFile",{subjectId:s,name:"aula4.pdf",contentBase64:pdf,contentType:"application/pdf"});
console.log("   4º arquivo:", up4.error?.message);
ok(up4.error?.data?.code==="FORBIDDEN" && /3 arquivos/.test(up4.error.message), "4º arquivo bloqueado com mensagem clara");
ok((await t(U,"materials.createNote",{subjectId:s,title:"n2",content:"anotação extra liberada"})).data?.status==="ready", "anotação continua liberada");
const big=await t(U,"study.generateQuiz",{subjectId:s,count:30});
console.log("   quiz de 30:", big.error?.message);
ok(big.error?.data?.code==="FORBIDDEN" && /50/.test(big.error.message), "quiz acima de 25 bloqueado, citando 50 no PRO");
const gens=[["study.generateQuiz",{subjectId:s,count:10}],["study.generateSummary",{subjectId:s}],["study.generateFlashcards",{subjectId:s,count:5}],["study.generateQuiz",{subjectId:s,count:25}],["study.generateQuiz",{subjectId:s,count:5}]];
let okGens=0; for (const [p,i] of gens) if ((await t(U,p,i)).data) okGens++;
ok(okGens===5, "5 gerações aceitas (quiz, resumo, flashcards)", okGens);
u=(await t(U,"account.usage",null,true)).data;
ok(u.usage.generations===5 && u.usage.files===3, "uso contabilizado: 5 gerações, 3 arquivos", JSON.stringify(u.usage));
const g6=await t(U,"study.generateFlashcards",{subjectId:s,count:5});
console.log("   6ª geração:", g6.error?.message);
ok(g6.error?.data?.code==="FORBIDDEN" && /renova em/.test(g6.error.message), "6ª geração bloqueada, com data de renovação");
ok((await t(U,"study.chatSend",{subjectId:s,message:"oi"})).data?.answer, "chat continua liberado");

console.log("\nPainel de usuários");
ok((await t(U,"admin.listUsers",null,true)).error?.data?.code==="FORBIDDEN", "aluno não acessa a lista de usuários");
const list=(await t(A,"admin.listUsers",null,true)).data; const bia=list.find(x=>x.email==="bia@example.com");
ok(list.length===2 && bia.files===3 && bia.generationsThisMonth===5 && bia.subjects===1, "admin vê usuários com uso", JSON.stringify(bia));
const self=await t(A,"admin.updateUser",{id:list.find(x=>x.email==="ana@example.com").id, role:"user"});
ok(self.error && /próprio acesso/.test(self.error.message), "admin não consegue tirar o próprio acesso");
ok((await t(A,"admin.updateUser",{id:bia.id, plan:"pro"})).data?.ok, "admin muda aluno para PRO");

console.log("\nPlano PRO");
u=(await t(U,"account.usage",null,true)).data;
ok(u.plan==="pro" && u.limits.maxFiles===null && u.limits.maxQuizQuestions===50, "limites do PRO aplicados na hora");
ok((await t(U,"materials.uploadFile",{subjectId:s,name:"aula4.pdf",contentBase64:pdf,contentType:"application/pdf"})).data?.status==="ready", "4º arquivo liberado no PRO");
const q50=await t(U,"study.generateQuiz",{subjectId:s,count:50});
ok(q50.data?.count===50, "quiz de 50 questões no PRO", JSON.stringify(q50.error?.message));
const qz=(await t(U,"study.getQuiz",{quizId:q50.data.quizId},true)).data;
const topics=[...new Set(qz.questions.map(x=>x.topic))];
ok(topics.length>=2 && topics.length<=8, `temas agrupados (${topics.length}: ${topics.join(", ")})`);
ok((await t(A,"admin.updateUser",{id:bia.id, role:"admin"})).data?.ok && (await t(U,"admin.listUsers",null,true)).data?.length===2, "admin promove aluno a admin");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
