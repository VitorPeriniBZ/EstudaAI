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
const stats = async()=> (await fetch("http://localhost:4004/stats")).json();
const A = await login("code-ana");
const s = (await t(A,"subjects.create",{name:"Parasito"})).data.id;
const big = Array.from({length:400},(_,i)=>`Linha ${i}: o Ascaris lumbricoides vive no jejuno e faz ciclo pulmonar.`).join("\n"); // ~28k chars
await t(A,"materials.createNote",{subjectId:s,title:"Aula 1",content:big});
await t(A,"materials.createNote",{subjectId:s,title:"Aula 1 (repetida)",content:big});

console.log("\nGroq-like com limite de 8000 tokens");
const p = await t(A,"admin.createProvider",{name:"Groq",type:"openai",apiKey:"gsk_test",baseUrl:"http://localhost:4004/tpm/v1",model:"openai/gpt-oss-120b",priority:2});
const q = await t(A,"study.generateQuiz",{subjectId:s,count:25});
const st = await stats(); console.log("   tentativas (tokens):", st.map(x=>x.tokens).join(" → "));
ok(q.data?.count===25, "quiz de 25 gerado depois de reduzir o material", JSON.stringify(q.error?.message));
ok(st[0].tokens < 12000, "duplicata ignorada (primeiro envio já sem a cópia)", JSON.stringify(st[0]));
ok(st.length>=2 && st.at(-1).tokens <= 8000, "segunda tentativa coube no limite");

console.log("\nProvedor que nunca comporta → passa para o próximo");
await t(A,"admin.updateProvider",{id:p.data.id, baseUrl:"http://localhost:4004/tiny/v1", apiKey:"gsk_test"}); // trocar a Base URL exige a chave
await t(A,"admin.createProvider",{name:"Reserva",type:"openai",apiKey:"sk-ok-1234567",baseUrl:"http://localhost:4002/ok/v1",model:"m",priority:5});
const q2 = await t(A,"study.generateQuiz",{subjectId:s,count:5});
ok(q2.data?.count===5, "quiz gerado pela reserva (failover após 'too large')", JSON.stringify(q2.error?.message));

console.log("\n429 de limite de taxa (mensagem real da Groq) → próxima IA, sem cortar o material");
await t(A,"admin.updateProvider",{id:p.data.id, enabled:false});
await t(A,"admin.createProvider",{name:"Groq sem cota no minuto",type:"openai",apiKey:"gsk_test",baseUrl:"http://localhost:4004/ratelimit/v1",model:"llama-3.3-70b-versatile",priority:1});
const antes = (await stats()).length;
const q3 = await t(A,"study.generateQuiz",{subjectId:s,count:5});
const rl = (await stats()).slice(antes).filter(x=>x.path==="ratelimit");
console.log("   tentativas no provedor com 429 (tokens):", rl.map(x=>x.tokens).join(" → "));
ok(q3.data?.count===5, "quiz gerado pela reserva depois do 429", JSON.stringify(q3.error?.message));
ok(rl.length>=1 && rl.every(x=>x.tokens===rl[0].tokens), "o material não foi reduzido por causa do 429", JSON.stringify(rl));
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
